// Shared by the owner-gated dashboard endpoints: verifies the caller's
// Supabase session belongs to the site owner. Same check as requireOwner in
// api/send-lead-email.js (and server/lib/auth.js), which still carry their own
// copies. The anon key is the public one already shipped in
// js/supabase-config.js — RLS, not the key, is what gates data access.

const SUPABASE_URL_FALLBACK = "https://ndoiommnmkeoukxbnobp.supabase.co";
const SUPABASE_ANON_KEY_FALLBACK = "sb_publishable_u3EntIBoaYn83t3sDXaL2g_kzgnZMT8";
const OWNER_EMAIL_FALLBACK = "concierge@propertiesbychel.com";

export function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

export async function requireOwner(request) {
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
