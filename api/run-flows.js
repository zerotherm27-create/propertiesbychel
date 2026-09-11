// Vercel Cron Function — walks every active flow enrollment forward and
// sends emails with NO human review step. This is the one place in the
// whole app that emails a lead unsupervised; everything else (Compose
// email, and the flow builder itself) requires a person to click Send.
//
// Triggered by Vercel Cron (see the "crons" entry in vercel.json), which
// makes a GET request carrying `Authorization: Bearer <CRON_SECRET>`
// automatically once that env var is set — this is Vercel's own
// convention for authenticating cron-triggered invocations, not a
// user session, so it's checked before anything else runs.
//
// Has no logged-in user to forward a token for, so — unlike every other
// server-side function in this app — it uses the Supabase SERVICE ROLE
// KEY (SUPABASE_SERVICE_ROLE_KEY), which bypasses Row Level Security
// entirely. This key must only ever live here, as a Vercel env var; it
// must never appear in any client-side file or on the Railway content
// agent.
//
// Requires: CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
// RESEND_FROM_EMAIL (Vercel env vars).

const SUPABASE_URL_FALLBACK = "https://ndoiommnmkeoukxbnobp.supabase.co";
const RESEND_URL = "https://api.resend.com/emails";
const MAX_HOPS_PER_TICK = 20; // guards against a cyclical graph
const MAX_SEND_RETRIES = 6; // ~6 hourly attempts before giving up on a transient send failure

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function substituteVars(text, values) {
  return String(text || "").replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] || "" : m));
}

// Same variable set and substitution rule as the dashboard's template
// preview (js/dashboard.js substituteTemplateVars) — kept in sync by hand
// since this runs in a separate deployment with no shared module.
function leadVariables(lead, listingTitle) {
  return {
    firstName: (lead.name || "").trim().split(/\s+/)[0] || "there",
    intent: lead.intent || "",
    districts: lead.districts || "",
    budgetRange: lead.budget_range || "",
    timeframe: lead.timeframe || "",
    status: lead.status || "",
    listingTitle: listingTitle || ""
  };
}

function renderTemplateEmailHtml(template, values) {
  const heading = substituteVars(template.heading, values);
  const body = substituteVars(template.body, values);
  const buttonText = substituteVars(template.button_text, values);
  // A lone newline inside a paragraph becomes a <br>, matching
  // api/send-lead-email.js's renderPlainTextEmailHtml — the dashboard
  // preview and this autonomous send must render the same body identically.
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => "<p>" + escapeHtml(p).replace(/\n/g, "<br>") + "</p>").join("");
  const image = template.art_image_url ? `<p><img src="${escapeHtml(template.art_image_url)}" style="max-width:100%"></p>` : "";
  const button = buttonText && template.button_url
    ? `<p><a href="${escapeHtml(template.button_url)}" style="display:inline-block;padding:10px 20px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(buttonText)}</a></p>`
    : "";
  return `${image}<h2>${escapeHtml(heading)}</h2>${paragraphs}${button}`;
}

function evaluateCondition(data, lead) {
  if (!data) return false;
  if (data.field === "status" && data.operator === "in") {
    return Array.isArray(data.value) && data.value.includes(lead.status);
  }
  return false;
}

function getNode(graph, nodeId) {
  return graph && graph.drawflow && graph.drawflow.Home && graph.drawflow.Home.data
    ? graph.drawflow.Home.data[nodeId]
    : null;
}

function nextNodeId(node, outputKey) {
  const output = node.outputs && node.outputs[outputKey];
  const conn = output && output.connections && output.connections[0];
  return conn ? String(conn.node) : null;
}

async function sendEmail(payload) {
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.RESEND_API_KEY },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Resend " + res.status + ": " + JSON.stringify(data));
  return data;
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const from = process.env.RESEND_FROM_EMAIL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !process.env.RESEND_API_KEY || !from) {
    return jsonResponse({ error: "Server misconfigured (missing service key or Resend config)" }, 500);
  }
  const supabaseUrl = process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK;
  const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" };

  async function db(path, opts) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers, ...opts });
    return res;
  }

  async function updateEnrollment(id, patch) {
    await db(`lead_flow_enrollments?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  // Looks up the lead's listing title (if any), renders the template with
  // that lead's variables, and sends — mirroring api/send-lead-email.js's
  // checks (no email / opted out) and dedup lock (the unique index on
  // (enrollment_id, node_id) in supabase/migration-email-flows.sql), but
  // using the service-role key since there's no owner session here.
  async function sendFlowEmail({ enrollmentId, nodeId, lead, templateId, templateCache }) {
    if (!lead.email) return { ok: false, reason: "no_email" };
    if (lead.email_opt_out) return { ok: false, reason: "opted_out" };
    if (!templateId) return { ok: false, reason: "no_template" };

    let template = templateCache && templateCache.get(templateId);
    if (template === undefined) {
      const tRes = await db(`email_templates?id=eq.${encodeURIComponent(templateId)}&select=*`);
      const [row] = tRes.ok ? await tRes.json() : [];
      template = row || null;
      if (templateCache) templateCache.set(templateId, template);
    }
    if (!template) return { ok: false, reason: "template_missing" };

    // A row already exists for this (enrollment_id, node_id) only if a
    // previous tick attempted this same step. If it actually went out,
    // this really is a duplicate call — do nothing. If it only got as far
    // as "sending" or failed, no email was ever delivered, so this is a
    // legitimate retry: reuse the row instead of re-inserting (which would
    // 409 against it and get misread as "already sent").
    const existingRes = await db(
      `lead_email_log?enrollment_id=eq.${encodeURIComponent(enrollmentId)}&node_id=eq.${encodeURIComponent(nodeId)}&select=id,status`
    );
    const [existing] = existingRes.ok ? await existingRes.json() : [];
    if (existing && existing.status === "sent") return { ok: true, duplicate: true };

    let listingTitle = "";
    if (lead.listing_slug) {
      const lRes = await db(`listings?slug=eq.${encodeURIComponent(lead.listing_slug)}&select=title`);
      const [listing] = lRes.ok ? await lRes.json() : [];
      listingTitle = listing ? listing.title : "";
    }
    const values = leadVariables(lead, listingTitle);
    const subject = substituteVars(template.subject, values) || template.name;
    const bodyHtml = renderTemplateEmailHtml(template, values);

    let logRowId;
    if (existing) {
      await db(`lead_email_log?id=eq.${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ subject, body_html: bodyHtml, status: "sending", error: null })
      });
      logRowId = existing.id;
    } else {
      const logRes = await db("lead_email_log", {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          lead_id: lead.id, enrollment_id: enrollmentId, node_id: nodeId,
          subject, body_html: bodyHtml, status: "sending"
        })
      });
      if (!logRes.ok) {
        // A concurrent tick won the race and inserted first — treat as done.
        if (logRes.status === 409) return { ok: true, duplicate: true };
        return { ok: false, reason: "log_failed" };
      }
      const [logRow] = await logRes.json();
      logRowId = logRow.id;
    }

    try {
      const result = await sendEmail({ from, to: lead.email, subject, html: bodyHtml });
      await db(`lead_email_log?id=eq.${logRowId}`, {
        method: "PATCH", body: JSON.stringify({ status: "sent", resend_id: result.id || null })
      });
      return { ok: true };
    } catch (err) {
      await db(`lead_email_log?id=eq.${logRowId}`, {
        method: "PATCH", body: JSON.stringify({ status: "failed", error: err.message })
      });
      return { ok: false, reason: "send_failed" };
    }
  }

  async function processEnrollment(enrollment, flow, lead, templateCache) {
    let nodeId = enrollment.current_node_id;
    // Every Wait block's delay_days is measured from enrollment, not from
    // whenever the walk happens to reach that block — so "Day 7" means the
    // same thing regardless of which branch a lead took to get there, and
    // a late-processed step doesn't push everything after it later too.
    const enrolledAt = new Date(enrollment.enrolled_at);
    let nodeEnteredAt = new Date(enrollment.node_entered_at);
    let hops = 0;

    while (hops++ < MAX_HOPS_PER_TICK) {
      const node = getNode(flow.graph, nodeId);
      if (!node) return updateEnrollment(enrollment.id, { status: "completed" });

      if (node.name === "trigger") {
        const next = nextNodeId(node, "output_1");
        if (!next) return updateEnrollment(enrollment.id, { status: "completed" });
        nodeId = next; nodeEnteredAt = new Date();
        continue;
      }

      if (node.name === "wait") {
        const delayDays = Math.max(0, Number(node.data.delay_days) || 0);
        const delayMs = delayDays * 86400000;
        // Clamped to nodeEnteredAt so a non-ascending delay_days value (a
        // hand-edit, or an AI-drafted branch that didn't keep counting from
        // enrollment) can never resolve as already-due before the walk
        // actually reached this block — it just becomes a no-op wait
        // instead of firing every remaining node in one tick.
        const dueAt = new Date(Math.max(enrolledAt.getTime() + delayMs, nodeEnteredAt.getTime()));
        if (Date.now() < dueAt.getTime()) {
          return updateEnrollment(enrollment.id, {
            current_node_id: nodeId, node_entered_at: nodeEnteredAt.toISOString(), next_check_at: dueAt.toISOString()
          });
        }
        const next = nextNodeId(node, "output_1");
        if (!next) return updateEnrollment(enrollment.id, { status: "completed" });
        nodeId = next; nodeEnteredAt = new Date();
        continue;
      }

      if (node.name === "send_email") {
        const result = await sendFlowEmail({ enrollmentId: enrollment.id, nodeId, lead, templateId: node.data.template_id, templateCache });
        if (!result.ok) {
          // No email / opted out / missing template won't resolve on their
          // own — stop this enrollment rather than retry forever. A
          // transient send failure gets retried hourly, up to a cap, so a
          // persistent problem (bad address, prolonged Resend outage)
          // eventually stops silently retrying too.
          const permanent = ["no_email", "opted_out", "no_template", "template_missing"].includes(result.reason);
          if (permanent) {
            return updateEnrollment(enrollment.id, { status: "cancelled", cancel_reason: result.reason });
          }
          const retryCount = (enrollment.send_retry_count || 0) + 1;
          if (retryCount > MAX_SEND_RETRIES) {
            return updateEnrollment(enrollment.id, { status: "cancelled", cancel_reason: "send_failed_repeatedly" });
          }
          return updateEnrollment(enrollment.id, {
            current_node_id: nodeId, node_entered_at: nodeEnteredAt.toISOString(),
            next_check_at: new Date(Date.now() + 3600000).toISOString(), send_retry_count: retryCount
          });
        }
        const next = nextNodeId(node, "output_1");
        if (!next) return updateEnrollment(enrollment.id, { status: "completed" });
        nodeId = next; nodeEnteredAt = new Date();
        if (enrollment.send_retry_count) { enrollment.send_retry_count = 0; await updateEnrollment(enrollment.id, { send_retry_count: 0 }); }
        continue;
      }

      if (node.name === "condition") {
        const next = nextNodeId(node, evaluateCondition(node.data, lead) ? "output_1" : "output_2");
        if (!next) return updateEnrollment(enrollment.id, { status: "completed" });
        nodeId = next; nodeEnteredAt = new Date();
        continue;
      }

      // Unrecognized node type — stop safely rather than guess.
      return updateEnrollment(enrollment.id, {
        current_node_id: nodeId, node_entered_at: nodeEnteredAt.toISOString(), next_check_at: new Date(Date.now() + 3600000).toISOString()
      });
    }

    // Hop cap hit, almost certainly a cycle in the graph — stop and retry
    // in an hour rather than loop forever within this one invocation.
    return updateEnrollment(enrollment.id, {
      current_node_id: nodeId, node_entered_at: nodeEnteredAt.toISOString(), next_check_at: new Date(Date.now() + 3600000).toISOString()
    });
  }

  const dueRes = await db(
    `lead_flow_enrollments?status=eq.active&next_check_at=lte.${encodeURIComponent(new Date().toISOString())}&select=*`
  );
  if (!dueRes.ok) return jsonResponse({ error: "Could not query due enrollments" }, 502);
  const enrollments = await dueRes.json();

  // Many enrollments typically share the same flow (that's the point of a
  // flow) and the same send-step template — fetch each distinct id once for
  // this whole run instead of once per enrollment/hop.
  const flowIds = [...new Set(enrollments.map((e) => e.flow_id))];
  const leadIds = [...new Set(enrollments.map((e) => e.lead_id))];
  const flowsById = new Map();
  const leadsById = new Map();
  if (flowIds.length) {
    const r = await db(`email_flows?id=in.(${flowIds.map(encodeURIComponent).join(",")})&select=*`);
    if (r.ok) for (const f of await r.json()) flowsById.set(f.id, f);
  }
  if (leadIds.length) {
    const r = await db(`leads?id=in.(${leadIds.map(encodeURIComponent).join(",")})&select=*`);
    if (r.ok) for (const l of await r.json()) leadsById.set(l.id, l);
  }
  const templateCache = new Map();

  let processed = 0;
  for (const enrollment of enrollments) {
    const flow = flowsById.get(enrollment.flow_id);
    const lead = leadsById.get(enrollment.lead_id);
    if (!flow || !lead) {
      await updateEnrollment(enrollment.id, { status: "cancelled", cancel_reason: !flow ? "flow_missing" : "lead_missing" });
      continue;
    }
    // A deactivated flow is meant to pause sending, not cancel leads already
    // on it — leave the enrollment as-is so it resumes if reactivated.
    if (!flow.active) continue;
    await processEnrollment(enrollment, flow, lead, templateCache);
    processed++;
  }

  return jsonResponse({ ok: true, due: enrollments.length, processed });
}

export const POST = GET;
