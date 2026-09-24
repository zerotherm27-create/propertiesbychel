// Vercel Function — receives Resend webhooks (Svix-signed) for the dashboard
// inbox: stores inbound mail (email.received) and keeps the delivery status
// of dashboard-sent mail (email.sent / delivered / bounced / failed) current
// in public.email_messages. Configure the endpoint in Resend → Webhooks as
// https://<site>/api/webhooks/resend.
//
// Requires RESEND_API_KEY (Full access — a sending-only key can't read
// received mail), RESEND_WEBHOOK_SECRET (the endpoint's whsec_… signing
// secret) and SUPABASE_SERVICE_ROLE_KEY. There is no user session on a
// webhook, so writes use the service role and bypass RLS — same pattern as
// api/run-flows.js. Never expose that key client-side.

import { Resend } from "resend";
import { jsonResponse } from "../_lib/owner-auth.js";

const SUPABASE_URL_FALLBACK = "https://ndoiommnmkeoukxbnobp.supabase.co";

// A status event can beat the send endpoint's own insert of the row (Resend
// fires email.sent almost immediately). Inside this window a missing row is
// treated as that race and answered with a 5xx so Resend retries; past it the
// email is assumed to be one this table never tracked (auto-replies, flow
// sends) and the event is acknowledged and dropped.
const RACE_WINDOW_MS = 5 * 60 * 1000;

// Delivery outcomes and the statuses each may overwrite. DELIVERED must not
// clobber a later BOUNCED, and nothing may revert a terminal state to SENT.
const STATUS_FOR_EVENT = {
  "email.delivered": { status: "DELIVERED", from: ["SENT"] },
  "email.bounced": { status: "BOUNCED", from: ["SENT", "DELIVERED"] },
  "email.failed": { status: "FAILED", from: ["SENT"] }
};

// "Name <a@b.com>" -> "a@b.com"
function bareAddress(value) {
  const m = String(value || "").match(/<([^>]+)>/);
  return (m ? m[1] : String(value || "")).trim().toLowerCase();
}

function headerValue(headers, name) {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : null;
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function POST(request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !apiKey || !serviceKey) {
    return jsonResponse({ error: "Webhook not configured" }, 501);
  }

  // Signature verification needs the exact bytes Resend sent.
  const payload = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return jsonResponse({ error: "Missing signature headers" }, 400);
  }

  const resend = new Resend(apiKey);
  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret
    });
  } catch {
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK;
  const rest = (path, init) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        ...(init && init.headers)
      }
    });

  try {
    if (event.type === "email.received") {
      return await storeInbound(event, resend, rest);
    }
    if (event.type === "email.sent") {
      return await backfillMessageId(event, rest);
    }
    if (STATUS_FOR_EVENT[event.type]) {
      return await updateStatus(event, rest);
    }
  } catch (err) {
    // 5xx makes Resend retry, which is what we want for a transient failure.
    console.error("resend webhook failed", event.type, err);
    return jsonResponse({ error: "Processing failed" }, 500);
  }

  // Events we don't track (opened, clicked, contact.*, …): acknowledge.
  return jsonResponse({ ok: true, ignored: event.type });
}

async function storeInbound(event, resend, rest) {
  const emailId = event.data.email_id;
  const { data: email, error } = await resend.emails.receiving.get(emailId);
  if (error || !email) throw new Error("Could not fetch received email: " + (error && error.message));

  // Best-effort link to a lead by sender address.
  let leadId = null;
  const sender = bareAddress(email.from);
  if (sender) {
    const leadRes = await rest(`leads?select=id&email=ilike.${encodeURIComponent(escapeLike(sender))}&limit=1`);
    if (leadRes.ok) {
      const [lead] = await leadRes.json();
      if (lead) leadId = lead.id;
    }
  }

  const row = {
    resend_id: emailId,
    message_id: email.message_id || event.data.message_id || null,
    in_reply_to: headerValue(email.headers, "in-reply-to"),
    direction: "INBOUND",
    from_address: email.from,
    to_address: (email.to || []).join(", "),
    subject: email.subject || "",
    html_body: email.html,
    text_body: email.text,
    status: "RECEIVED",
    lead_id: leadId,
    created_at: email.created_at || event.data.created_at || undefined
  };

  // Upsert on resend_id so a Resend retry can't create a duplicate.
  const res = await rest("email_messages?on_conflict=resend_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error("Insert failed: " + res.status + " " + (await res.text()));
  return jsonResponse({ ok: true });
}

// Resend doesn't reveal an outbound message's Message-ID when it's sent; it
// arrives with email.sent. Storing it lets a later reply to that message thread.
async function backfillMessageId(event, rest) {
  const { email_id: emailId, message_id: messageId } = event.data;
  if (!messageId) return jsonResponse({ ok: true });
  return patchOutbound(event, rest, `email_messages?resend_id=eq.${encodeURIComponent(emailId)}&direction=eq.OUTBOUND`, {
    message_id: messageId
  });
}

async function updateStatus(event, rest) {
  const rule = STATUS_FOR_EVENT[event.type];
  const emailId = event.data.email_id;
  const allowedFrom = rule.from.join(",");
  return patchOutbound(
    event,
    rest,
    `email_messages?resend_id=eq.${encodeURIComponent(emailId)}&direction=eq.OUTBOUND&status=in.(${allowedFrom})`,
    { status: rule.status }
  );
}

async function patchOutbound(event, rest, path, patch) {
  const res = await rest(path, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error("Update failed: " + res.status + " " + (await res.text()));
  const rows = await res.json();
  if (rows.length) return jsonResponse({ ok: true });

  // No row changed: either it's not ours, it's already at/after this status
  // (duplicate or out-of-order event), or the send endpoint hasn't inserted
  // the row yet.
  const existing = await rest(
    `email_messages?select=id&resend_id=eq.${encodeURIComponent(event.data.email_id)}&limit=1`
  );
  if (existing.ok && (await existing.json()).length) return jsonResponse({ ok: true, unchanged: true });

  const age = Date.now() - new Date(event.created_at || event.data.created_at).getTime();
  if (age < RACE_WINDOW_MS) {
    return jsonResponse({ error: "Message not recorded yet; retry" }, 500);
  }
  return jsonResponse({ ok: true, ignored: "untracked email" });
}
