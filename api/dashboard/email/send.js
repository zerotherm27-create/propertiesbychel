// Vercel Function — sends a one-off email from the dashboard inbox via Resend
// and records it in public.email_messages as OUTBOUND. Owner-only. Delivery
// status is kept current afterwards by api/webhooks/resend.js.
//
// POST { to, subject, htmlBody, textBody?, parentMessageId? }
// When parentMessageId (the Message-ID of the email being replied to) is
// given, In-Reply-To / References are set so the reply threads in the
// recipient's mail client.
//
// Requires RESEND_API_KEY / RESEND_FROM_EMAIL (see api/notify-lead.js) plus
// the SUPABASE_URL / SUPABASE_ANON_KEY / OWNER_EMAIL handled in _lib/owner-auth.js.

import { Resend } from "resend";
import { requireOwner, jsonResponse } from "../../_lib/owner-auth.js";

const MAX_SUBJECT = 300;
const MAX_BODY = 500_000;
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

// Message-IDs go straight into a header, so reject anything that could break
// out of it, and normalise to the <id> form the RFC requires.
function normaliseMessageId(value) {
  const id = String(value || "").trim();
  if (!id || id.length > 998 || /[\r\n\s]/.test(id)) return null;
  return id.startsWith("<") ? id : `<${id}>`;
}

// HTML-only mail scores worse with spam filters than mail with a matching
// plain-text part, so derive one when the caller didn't send it.
function htmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&middot;/g, "\u00b7").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const { to, subject, htmlBody, textBody, parentMessageId } = payload || {};

  if (typeof to !== "string" || !EMAIL_RE.test(to.trim())) {
    return jsonResponse({ error: "A valid recipient address is required" }, 400);
  }
  if (typeof subject !== "string" || !subject.trim() || /[\r\n]/.test(subject)) {
    return jsonResponse({ error: "A single-line subject is required" }, 400);
  }
  if (subject.length > MAX_SUBJECT) return jsonResponse({ error: "Subject is too long" }, 400);
  if (typeof htmlBody !== "string" || !htmlBody.trim()) {
    return jsonResponse({ error: "Email body can't be blank" }, 400);
  }
  if (htmlBody.length > MAX_BODY) return jsonResponse({ error: "Email body is too long" }, 400);
  if (textBody != null && (typeof textBody !== "string" || textBody.length > MAX_BODY)) {
    return jsonResponse({ error: "Invalid text body" }, 400);
  }

  let parentId = null;
  if (parentMessageId != null && parentMessageId !== "") {
    parentId = normaliseMessageId(parentMessageId);
    if (!parentId) return jsonResponse({ error: "Invalid parentMessageId" }, 400);
  }

  const text = textBody || htmlToText(htmlBody);

  const message = {
    from,
    to: to.trim(),
    subject: subject.trim(),
    html: htmlBody,
    // Where the recipient's replies go. Must be an address Resend receives
    // for (the normal From address may route to another mail provider).
    ...(process.env.RESEND_REPLY_TO ? { replyTo: process.env.RESEND_REPLY_TO } : {}),
    ...(text ? { text } : {}),
    ...(parentId ? { headers: { "In-Reply-To": parentId, References: parentId } } : {})
  };

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent;
  try {
    const { data, error } = await resend.emails.send(message);
    if (error || !data) throw new Error((error && error.message) || "Send failed");
    sent = data;
  } catch (err) {
    return jsonResponse({ error: err.message || "Send failed" }, 502);
  }

  // Log with the caller's own token so RLS (is_owner()) applies. If this
  // fails the email has already gone out, so report success with a warning
  // instead of an error the owner might retry into a duplicate send.
  const logRes = await fetch(`${supabaseUrl}/rest/v1/email_messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      resend_id: sent.id,
      in_reply_to: parentId,
      direction: "OUTBOUND",
      from_address: from,
      to_address: to.trim(),
      subject: subject.trim(),
      html_body: htmlBody,
      text_body: text || null,
      status: "SENT"
    })
  });
  if (!logRes.ok) {
    return jsonResponse({ ok: true, resend_id: sent.id, warning: "Sent, but could not be recorded in the inbox" });
  }
  const [row] = await logRes.json();
  return jsonResponse({ ok: true, id: row.id, resend_id: sent.id });
}
