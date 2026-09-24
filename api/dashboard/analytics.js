// Vercel Function — aggregates first-party visit statistics for the dashboard's
// Analytics tab. Owner-only. GET ?range=24h|7d|30d|90d.
//
// Reads site_sessions / site_pageviews with the caller's own session token, so
// RLS (is_owner()) is the authorization — no service key needed here. Aggregation
// is done in application code, which is plenty at this site's volume.
//
// Definitions: a session is activity inside a sliding 30-minute window; bounce
// rate = share of sessions with exactly one page view (a deliberate simplification
// of GA4's "engaged session"); "active now" = sessions seen in the last 5 minutes.
// Days and hours are bucketed in Philippine time (UTC+8, no DST).

import { requireOwner, jsonResponse } from "../_lib/owner-auth.js";

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const RANGES = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY, "90d": 90 * DAY };
const MANILA_OFFSET = 8 * HOUR;
const PAGE = 1000;
const MAX_PAGES = 60; // 60k rows per table per request
const TOP = 15;
const ACTIVE_WINDOW = 5 * 60e3;

const SESSION_COLUMNS =
  "id,created_at,last_seen_at,duration_seconds,landing_path,page_count,device_type,os,browser,country,region,city,referrer,utm_source,utm_medium,utm_campaign";

async function fetchAll(supabaseUrl, headers, path) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: { ...headers, Range: `${page * PAGE}-${page * PAGE + PAGE - 1}`, "Range-Unit": "items" }
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(text);
      err.status = res.status;
      throw err;
    }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function tally(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key == null || key === "") continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function top(counts, shape) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([key, count]) => ({ ...shape(key), count }));
}

function sourceOf(s) {
  if (s.utm_source) return s.utm_source.toLowerCase();
  if (s.referrer) {
    try { return new URL(s.referrer).hostname.replace(/^www\./, ""); } catch { /* fall through */ }
  }
  return "direct";
}

const manilaKey = (ms, hourly) => new Date(ms + MANILA_OFFSET).toISOString().slice(0, hourly ? 13 : 10);

export async function GET(request) {
  const auth = await requireOwner(request);
  if (auth.error) return auth.error;
  const { token, supabaseUrl, anonKey } = auth;

  const range = new URL(request.url).searchParams.get("range") || "7d";
  if (!RANGES[range]) return jsonResponse({ error: "range must be 24h, 7d, 30d or 90d" }, 400);

  const now = Date.now();
  const since = new Date(now - RANGES[range]).toISOString();
  const headers = { Authorization: `Bearer ${token}`, apikey: anonKey };

  let sessions, pageviews, truncated;
  try {
    const s = await fetchAll(supabaseUrl, headers,
      `site_sessions?select=${SESSION_COLUMNS}&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc,id.asc`);
    const p = await fetchAll(supabaseUrl, headers,
      `site_pageviews?select=path,occurred_at&occurred_at=gte.${encodeURIComponent(since)}&order=occurred_at.asc,id.asc`);
    sessions = s.rows;
    pageviews = p.rows;
    truncated = s.truncated || p.truncated;
  } catch (err) {
    if (err.status === 404) {
      return jsonResponse({ error: "Analytics tables not found. Run supabase/migration-site-analytics.sql in the Supabase SQL editor." }, 503);
    }
    console.error("analytics query failed", err);
    return jsonResponse({ error: "Could not load analytics" }, 502);
  }

  const n = sessions.length;
  const bounced = sessions.filter((s) => (s.page_count || 1) <= 1).length;
  const totalDuration = sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

  // Time series: hourly for 24h, daily otherwise, in Philippine time, zero-filled.
  const hourly = range === "24h";
  const step = hourly ? HOUR : DAY;
  const buckets = new Map();
  for (let t = now - RANGES[range]; t <= now + step; t += step) {
    const key = manilaKey(t, hourly);
    if (!buckets.has(key)) buckets.set(key, { key, sessions: 0, pageviews: 0 });
  }
  for (const s of sessions) { const b = buckets.get(manilaKey(Date.parse(s.created_at), hourly)); if (b) b.sessions++; }
  for (const v of pageviews) { const b = buckets.get(manilaKey(Date.parse(v.occurred_at), hourly)); if (b) b.pageviews++; }
  const nowKey = manilaKey(now, hourly);
  const series = [...buckets.values()].filter((b) => b.key <= nowKey);

  const recent = sessions.slice(-30).reverse().map((s) => ({
    started_at: s.created_at, last_seen_at: s.last_seen_at, duration_seconds: s.duration_seconds,
    country: s.country, region: s.region, city: s.city, device_type: s.device_type, os: s.os,
    browser: s.browser, landing_path: s.landing_path, page_count: s.page_count, source: sourceOf(s)
  }));

  return new Response(JSON.stringify({
    range, since, generated_at: new Date(now).toISOString(), truncated, bucket: hourly ? "hour" : "day",
    totals: {
      sessions: n,
      pageviews: pageviews.length,
      avg_duration_seconds: n ? Math.round(totalDuration / n) : 0,
      bounce_rate: n ? bounced / n : 0,
      active_now: sessions.filter((s) => now - Date.parse(s.last_seen_at) <= ACTIVE_WINDOW).length
    },
    series,
    breakdowns: {
      devices: top(tally(sessions, (s) => s.device_type), (k) => ({ label: k })),
      os: top(tally(sessions, (s) => s.os), (k) => ({ label: k })),
      browsers: top(tally(sessions, (s) => s.browser), (k) => ({ label: k })),
      pages: top(tally(pageviews, (v) => v.path), (k) => ({ label: k })),
      landing_pages: top(tally(sessions, (s) => s.landing_path), (k) => ({ label: k })),
      sources: top(tally(sessions, sourceOf), (k) => ({ label: k })),
      countries: top(tally(sessions, (s) => s.country), (k) => ({ label: k })),
      regions: top(tally(sessions.filter((s) => s.region), (s) => `${s.country || ""}|${s.region}`),
        (k) => { const [country, ...r] = k.split("|"); return { label: r.join("|"), country }; }),
      cities: top(tally(sessions.filter((s) => s.city), (s) => `${s.country || ""}|${s.city}`),
        (k) => { const [country, ...c] = k.split("|"); return { label: c.join("|"), country }; })
    },
    recent
  }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
