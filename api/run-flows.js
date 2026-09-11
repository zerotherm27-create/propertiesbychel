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
  const paragraphs = body.split("\n\n").filter(Boolean).map((p) => "<p>" + escapeHtml(p) + "</p>").join("");
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
  async function sendFlowEmail({ enrollmentId, nodeId, lead, templateId }) {
    if (!lead.email) return { ok: false, reason: "no_email" };
    if (lead.email_opt_out) return { ok: false, reason: "opted_out" };
    if (!templateId) return { ok: false, reason: "no_template" };

    const tRes = await db(`email_templates?id=eq.${encodeURIComponent(templateId)}&select=*`);
    const [template] = tRes.ok ? await tRes.json() : [];
    if (!template) return { ok: false, reason: "template_missing" };

    let listingTitle = "";
    if (lead.listing_slug) {
      const lRes = await db(`listings?slug=eq.${encodeURIComponent(lead.listing_slug)}&select=title`);
      const [listing] = lRes.ok ? await lRes.json() : [];
      listingTitle = listing ? listing.title : "";
    }
    const values = leadVariables(lead, listingTitle);
    const subject = substituteVars(template.subject, values) || template.name;
    const bodyHtml = renderTemplateEmailHtml(template, values);

    const logRes = await db("lead_email_log", {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        lead_id: lead.id, enrollment_id: enrollmentId, node_id: nodeId,
        subject, body_html: bodyHtml, status: "sending"
      })
    });
    if (!logRes.ok) {
      if (logRes.status === 409) return { ok: true, duplicate: true }; // already sent this node — treat as done
      return { ok: false, reason: "log_failed" };
    }
    const [logRow] = await logRes.json();

    try {
      const result = await sendEmail({ from, to: lead.email, subject, html: bodyHtml });
      await db(`lead_email_log?id=eq.${logRow.id}`, {
        method: "PATCH", body: JSON.stringify({ status: "sent", resend_id: result.id || null })
      });
      return { ok: true };
    } catch (err) {
      await db(`lead_email_log?id=eq.${logRow.id}`, {
        method: "PATCH", body: JSON.stringify({ status: "failed", error: err.message })
      });
      return { ok: false, reason: "send_failed" };
    }
  }

  async function processEnrollment(enrollment, flow, lead) {
    let nodeId = enrollment.current_node_id;
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
        const delayMs = (node.data.delay_days || 0) * 86400000;
        if (Date.now() - nodeEnteredAt.getTime() < delayMs) {
          const dueAt = new Date(nodeEnteredAt.getTime() + delayMs);
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
        const result = await sendFlowEmail({ enrollmentId: enrollment.id, nodeId, lead, templateId: node.data.template_id });
        if (!result.ok) {
          // No email / opted out / missing template won't resolve on their
          // own — stop this enrollment rather than retry forever. A
          // transient send failure just gets retried next tick.
          const permanent = ["no_email", "opted_out", "no_template", "template_missing"].includes(result.reason);
          return updateEnrollment(enrollment.id, permanent
            ? { status: "cancelled" }
            : { current_node_id: nodeId, node_entered_at: nodeEnteredAt.toISOString(), next_check_at: new Date(Date.now() + 3600000).toISOString() });
        }
        const next = nextNodeId(node, "output_1");
        if (!next) return updateEnrollment(enrollment.id, { status: "completed" });
        nodeId = next; nodeEnteredAt = new Date();
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

  let processed = 0;
  for (const enrollment of enrollments) {
    const flowRes = await db(`email_flows?id=eq.${encodeURIComponent(enrollment.flow_id)}&select=*`);
    const [flow] = flowRes.ok ? await flowRes.json() : [];
    const leadRes = await db(`leads?id=eq.${encodeURIComponent(enrollment.lead_id)}&select=*`);
    const [lead] = leadRes.ok ? await leadRes.json() : [];
    if (!flow || !lead) { await updateEnrollment(enrollment.id, { status: "cancelled" }); continue; }
    await processEnrollment(enrollment, flow, lead);
    processed++;
  }

  return jsonResponse({ ok: true, due: enrollments.length, processed });
}

export const POST = GET;
