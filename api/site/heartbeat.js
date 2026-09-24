// Vercel Function — keeps a first-party analytics session alive and its duration
// current. js/visit.js beacons here every ~15s while the tab is visible and once
// more on page hide. Only touches a session that already exists and is still
// inside its 30-minute window; never creates one. A database trigger derives
// duration_seconds from last_seen_at, so this is a single cheap PATCH. Always 204.

import {
  SESSION_TTL_SECONDS, noContent, readSessionId, sessionCookie, shouldSkip, serviceClient
} from "../_lib/visitor.js";

export async function POST(request) {
  try {
    if (await shouldSkip(request)) return noContent();
    const id = readSessionId(request);
    const db = serviceClient();
    if (!id || !db) return noContent();

    const cutoff = new Date(Date.now() - SESSION_TTL_SECONDS * 1000).toISOString();
    const res = await db(`site_sessions?id=eq.${id}&last_seen_at=gte.${encodeURIComponent(cutoff)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() })
    });
    const rows = res.ok ? await res.json() : [];
    // Refresh the cookie's sliding window only for a session that is still live.
    return noContent(rows.length ? { "Set-Cookie": sessionCookie(request, id) } : undefined);
  } catch (err) {
    console.error("heartbeat failed", err);
    return noContent();
  }
}
