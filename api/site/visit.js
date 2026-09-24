// Vercel Function — records one page view for first-party analytics. Called by
// js/visit.js on every public page load. Deliberately boring route name: ad
// blockers match words like "track"/"analytics"/"collect" in a path.
//
// Session = activity inside a sliding 30-minute window, identified by an httpOnly
// cookie (see api/_lib/visitor.js). A first visit inserts a site_sessions row
// (device/OS/browser from the User-Agent, country/region/city from the host's geo
// headers — never the IP itself); later ones bump page_count. Always answers 204
// and swallows every error: analytics must never affect a page.
//
// Needs SUPABASE_SERVICE_ROLE_KEY (already set for api/run-flows.js) and the
// tables from supabase/migration-site-analytics.sql.

import {
  SESSION_TTL_SECONDS, noContent, readSessionId, sessionCookie, shouldSkip, parseDevice,
  readGeo, normalisePath, pickUtm, cleanReferrer, serviceClient
} from "../_lib/visitor.js";

export async function POST(request) {
  try {
    if (shouldSkip(request)) return noContent();
    const db = serviceClient();
    if (!db) return noContent();

    let body = {};
    try {
      const text = await request.text();
      if (text.length < 4096) body = JSON.parse(text) || {};
    } catch {
      body = {};
    }
    const path = normalisePath(body.path, body.query);
    const nowIso = new Date().toISOString();

    let id = readSessionId(request);
    let session = null;
    if (id) {
      const res = await db(`site_sessions?id=eq.${id}&select=id,last_seen_at,page_count`);
      if (res.ok) [session] = await res.json();
      if (session && Date.now() - Date.parse(session.last_seen_at) > SESSION_TTL_SECONDS * 1000) session = null;
    }

    if (session) {
      await db(`site_sessions?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ last_seen_at: nowIso, page_count: (session.page_count || 1) + 1 })
      });
    } else {
      id = crypto.randomUUID();
      const ua = request.headers.get("user-agent") || "";
      const res = await db("site_sessions", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id, created_at: nowIso, last_seen_at: nowIso, landing_path: path, page_count: 1,
          ...parseDevice(ua, body.touch === true),
          ...readGeo(request),
          referrer: cleanReferrer(body.referrer),
          ...pickUtm(body.query)
        })
      });
      if (!res.ok) return noContent();
    }

    await db("site_pageviews", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ session_id: id, path, occurred_at: nowIso })
    });
    return noContent({ "Set-Cookie": sessionCookie(request, id) });
  } catch (err) {
    console.error("visit failed", err);
    return noContent();
  }
}
