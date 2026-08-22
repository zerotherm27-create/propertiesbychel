// Vercel Function — emails the owner about a new enquiry and auto-replies to
// the enquirer, via Resend. Called by js/site.js after a lead is saved to
// Supabase; email delivery is best-effort and never blocks the lead itself.
//
// Requires RESEND_API_KEY (added automatically by the Resend marketplace
// integration) and RESEND_FROM_EMAIL (an address on a domain verified in
// Resend — set this yourself in Vercel → Project → Settings → Environment
// Variables once the domain is verified).

const RESEND_URL = "https://api.resend.com/emails";
const OWNER_EMAIL = "concierge@propertiesbychel.com";

// Only the site itself should ever call this — it's the endpoint that
// actually sends mail, and it has no auth. Anyone who finds the URL could
// otherwise POST arbitrary JSON straight at it and spam the owner's inbox
// with no need to go through the site or Supabase at all.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin === "https://propertiesbychel.com" || origin === "https://www.propertiesbychel.com") return true;
  return /^https:\/\/propertiesbychel[a-z0-9.-]*\.vercel\.app$/.test(origin);
}

function refererOrigin(referer) {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

// A blocked/junk request gets a plain 200 "ok" rather than an error, same as
// a genuine one — giving a bot nothing to distinguish "worked" from "didn't"
// means no signal to adapt against.
function silentOk() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

const LEAD_FIELDS = [
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["intent", "Interest"],
  ["districts", "Districts"],
  ["budget_range", "Budget"],
  ["timeframe", "Timeframe"],
  ["listing_slug", "Listing"],
  ["source_page", "Source page"],
  ["notes", "Notes"]
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
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
  if (!res.ok) throw new Error("Resend " + res.status + ": " + (await res.text()));
}

function ownerNotificationHtml(lead) {
  const rows = LEAD_FIELDS
    .map(function ([key, label]) {
      return lead[key] ? [label, lead[key]] : null;
    })
    .filter(Boolean);
  const body = rows
    .map(function ([label, value]) {
      return "<tr><td style=\"padding:4px 12px 4px 0;color:#666\">" + escapeHtml(label) + "</td><td>" + escapeHtml(value) + "</td></tr>";
    })
    .join("");
  return "<h2>New enquiry from " + escapeHtml(lead.name || "a visitor") + "</h2><table>" + body + "</table>";
}

function autoReplyHtml(lead) {
  return (
    "<p>Dear " + escapeHtml(lead.name || "there") + ",</p>" +
    "<p>Your request has been noted. Expect a personal reply within one business day.</p>" +
    "<p>&mdash; Properties by Chel</p>"
  );
}

export async function POST(request) {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY || !from) {
    return new Response(JSON.stringify({ error: "Email not configured" }), {
      status: 501,
      headers: { "Content-Type": "application/json" }
    });
  }

  const origin = request.headers.get("origin") || refererOrigin(request.headers.get("referer"));
  if (!isAllowedOrigin(origin)) return silentOk();

  let lead;
  try {
    lead = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!lead || typeof lead !== "object") return silentOk();

  const hasContent = ["name", "email", "notes"].some(function (k) {
    return typeof lead[k] === "string" && lead[k].trim();
  });
  if (!hasContent) return silentOk();

  const enquirerEmail = typeof lead.email === "string" ? lead.email.trim() : "";
  const tasks = [
    sendEmail({
      from: from,
      to: OWNER_EMAIL,
      reply_to: enquirerEmail || undefined,
      subject: "New enquiry from " + (lead.name || "a visitor"),
      html: ownerNotificationHtml(lead)
    })
  ];
  if (enquirerEmail) {
    tasks.push(
      sendEmail({
        from: from,
        to: enquirerEmail,
        subject: "Your enquiry has been received — Properties by Chel",
        html: autoReplyHtml(lead)
      })
    );
  }

  const results = await Promise.allSettled(tasks);
  const allFailed = results.every(function (r) { return r.status === "rejected"; });
  if (allFailed) {
    return new Response(JSON.stringify({ error: "Email delivery failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
