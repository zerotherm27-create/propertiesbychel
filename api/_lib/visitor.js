// Shared by the first-party analytics endpoints (api/site/visit.js and
// api/site/heartbeat.js): session cookie, user-agent parsing, geo headers, and a
// service-role Supabase client. Writes use SUPABASE_SERVICE_ROLE_KEY (there is
// no visitor login), so this must only ever run server-side.

import { UAParser } from "ua-parser-js";
import { isBot, isAICrawler } from "ua-parser-js/bot-detection";

const SUPABASE_URL_FALLBACK = "https://ndoiommnmkeoukxbnobp.supabase.co";

export const SESSION_COOKIE = "pbc_sid";
export const SESSION_TTL_SECONDS = 30 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELF_HOST_RE = /(^|\.)propertiesbychel\.com$/i;

export function noContent(headers) {
  return new Response(null, { status: 204, headers });
}

export function readSessionId(request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(SESSION_COOKIE + "="));
  const id = match ? match.slice(SESSION_COOKIE.length + 1) : "";
  return UUID_RE.test(id) ? id.toLowerCase() : null;
}

// httpOnly + a sliding Max-Age: 30 minutes of inactivity and the cookie simply
// expires, so there is no cleanup job and the browser never sees the id.
export function sessionCookie(request, id) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${id}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

export function shouldSkip(request) {
  const ua = request.headers.get("user-agent");
  if (!ua) return true;
  return isBot(ua) || isAICrawler(ua) || /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(ua);
}

// iPadOS Safari sends a Macintosh user agent; the client reports touch support so
// a "desktop Mac" that has a touchscreen is classed as a tablet.
export function parseDevice(ua, touch) {
  const r = new UAParser(ua).getResult();
  let type = r.device.type;
  if (type !== "mobile" && type !== "tablet") type = "desktop";
  if (type === "desktop" && touch && r.os.name === "macOS") type = "tablet";
  return { device_type: type, os: r.os.name || null, browser: r.browser.name || null };
}

// Vercel resolves geography from the connection and sets these headers in
// production (absent in local dev). Only derived places are stored, never the IP.
export function readGeo(request) {
  const decode = (v) => { try { return v ? decodeURIComponent(v) : null; } catch { return v || null; } };
  return {
    country: request.headers.get("x-vercel-ip-country") || null,
    region: decode(request.headers.get("x-vercel-ip-country-region")),
    city: decode(request.headers.get("x-vercel-ip-city"))
  };
}

// Path only, no query — except ?slug=, which is what tells one property page
// from another on this site. Clean URLs mean "/about.html" and "/about" are one page.
export function normalisePath(rawPath, rawQuery) {
  let path = String(rawPath || "/").split(/[?#]/)[0].slice(0, 200) || "/";
  if (!path.startsWith("/")) path = "/" + path;
  path = path.replace(/\.html$/i, "").replace(/\/index$/i, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  const slug = new URLSearchParams(String(rawQuery || "")).get("slug");
  if (slug && /^[\w-]{1,100}$/.test(slug)) path += "?slug=" + slug;
  return path || "/";
}

export function pickUtm(rawQuery) {
  const q = new URLSearchParams(String(rawQuery || ""));
  const get = (k) => (q.get(k) || "").trim().slice(0, 100) || null;
  return { utm_source: get("utm_source"), utm_medium: get("utm_medium"), utm_campaign: get("utm_campaign") };
}

// Origin + path only (no query or fragment); the site's own pages don't count as a referrer.
export function cleanReferrer(raw) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol) || SELF_HOST_RE.test(u.hostname)) return null;
    return (u.origin + u.pathname).slice(0, 300);
  } catch {
    return null;
  }
}

export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const base = (process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK) + "/rest/v1/";
  return (path, init) =>
    fetch(base + path, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init && init.headers) }
    });
}
