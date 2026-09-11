// Vercel Function — sends an owner-composed (optionally AI-drafted) one-off
// email to a lead via Resend, gated to the signed-in dashboard owner only.
// Every send is logged in lead_email_log for an audit trail. (Flow-driven
// autonomous sends are a separate code path — see api/run-flows.js — since
// those have no owner session to authenticate and follow a different
// dedup/advance mechanism keyed on enrollment_id/node_id.)
//
// Requires RESEND_API_KEY / RESEND_FROM_EMAIL (see api/notify-lead.js) plus
// SUPABASE_URL / SUPABASE_ANON_KEY / OWNER_EMAIL to verify the caller — the
// same public anon key already used client-side, not a new secret.

const RESEND_URL = "https://api.resend.com/emails";
const SUPABASE_URL_FALLBACK = "https://ndoiommnmkeoukxbnobp.supabase.co";
const SUPABASE_ANON_KEY_FALLBACK = "sb_publishable_u3EntIBoaYn83t3sDXaL2g_kzgnZMT8";
const OWNER_EMAIL_FALLBACK = "concierge@propertiesbychel.com";

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

// The compose box is a plain textarea, not a rich-text editor, and the AI
// draft is instructed to write "plain paragraphs separated by blank lines"
// (server/lib/leads.js) — never actual markup. Converting that to real
// HTML here, once, right before it's logged and sent, means both an
// AI draft and anything the owner hand-edits in the textarea render as
// proper paragraphs instead of one run-on block, and can't be
// misinterpreted as HTML by accident.
function renderPlainTextEmailHtml(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => "<p>" + escapeHtml(p).replace(/\n/g, "<br>") + "</p>")
    .join("");
}

// Mirrors server/lib/auth.js's requireOwner, adapted to this Vercel
// function's Web-standard Request/Response shape (that file's Express
// middleware shape can't be imported directly into a separate deployment).
async function requireOwner(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return { error: jsonResponse({ error: "Missing authorization" }, 401) };

  const supabaseUrl = process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK;
  const anonKey = process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_FALLBACK;
  const ownerEmail = (process.env.OWNER_EMAIL || OWNER_EMAIL_FALLBACK).toLowerCase();

  let user;
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey }
    });
    if (!r.ok) return { error: jsonResponse({ error: "Invalid session" }, 401) };
    user = await r.json();
  } catch {
    return { error: jsonResponse({ error: "Auth check failed" }, 401) };
  }
  if ((user.email || "").toLowerCase() !== ownerEmail) {
    return { error: jsonResponse({ error: "Not authorized" }, 403) };
  }
  return { token, supabaseUrl, anonKey };
}

async function sendEmail(payload) {
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.RESEND_API_KEY
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Resend " + res.status + ": " + JSON.stringify(data));
  return data;
}

export async function POST(request) {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY || !from) {
    return jsonResponse({ error: "Email not configured" }, 501);
  }

  const auth = await requireOwner(request);
  if (auth.error) return auth.error;
  const { token, supabaseUrl, anonKey } = auth;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { lead_id, subject, body_html: rawBody, goal } = payload || {};
  if (!lead_id || !subject || !rawBody) {
    return jsonResponse({ error: "lead_id, subject, and body_html are required" }, 400);
  }
  const body_html = renderPlainTextEmailHtml(rawBody);
  if (!body_html) {
    return jsonResponse({ error: "Email body can't be blank" }, 400);
  }

  // The caller's own token is forwarded for every Supabase REST call below,
  // so RLS (is_owner()-gated) applies exactly as it would from the dashboard.
  const restHeaders = { Authorization: `Bearer ${token}`, apikey: anonKey, "Content-Type": "application/json" };

  const leadRes = await fetch(
    `${supabaseUrl}/rest/v1/leads?id=eq.${encodeURIComponent(lead_id)}&select=email,email_opt_out`,
    { headers: restHeaders }
  );
  if (!leadRes.ok) return jsonResponse({ error: "Could not look up this lead" }, 502);
  const [lead] = await leadRes.json();
  if (!lead) return jsonResponse({ error: "Lead not found" }, 404);
  if (!lead.email) return jsonResponse({ error: "This lead has no email address" }, 400);
  if (lead.email_opt_out) return jsonResponse({ error: "This lead has opted out of email" }, 403);

  const logRes = await fetch(`${supabaseUrl}/rest/v1/lead_email_log`, {
    method: "POST",
    headers: { ...restHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ lead_id, subject, body_html, goal: goal || null, status: "sending" })
  });
  if (!logRes.ok) return jsonResponse({ error: "Could not record this send" }, 502);
  const [logRow] = await logRes.json();

  let resendResult;
  try {
    resendResult = await sendEmail({ from, to: lead.email, subject, html: body_html });
  } catch (err) {
    await fetch(`${supabaseUrl}/rest/v1/lead_email_log?id=eq.${logRow.id}`, {
      method: "PATCH",
      headers: restHeaders,
      body: JSON.stringify({ status: "failed", error: err.message })
    });
    return jsonResponse({ error: err.message || "Send failed" }, 502);
  }

  await fetch(`${supabaseUrl}/rest/v1/lead_email_log?id=eq.${logRow.id}`, {
    method: "PATCH",
    headers: restHeaders,
    body: JSON.stringify({ status: "sent", resend_id: resendResult.id || null })
  });

  return jsonResponse({ ok: true, log_id: logRow.id, resend_id: resendResult.id || null });
}
