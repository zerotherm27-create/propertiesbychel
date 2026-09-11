// Vercel Routing Middleware — fronts the public site with the coming-soon
// page when the "coming_soon" Edge Config flag is true. Flip it in the Vercel
// dashboard (Storage → Edge Config) or `vercel edge-config update` — takes
// effect immediately, no redeploy needed.
//
// Preview bypass: visiting /?preview=<PREVIEW_BYPASS_TOKEN> once sets a
// cookie so the owner keeps seeing the real site everywhere, even while
// coming_soon is on for everyone else.
import { get } from "@vercel/edge-config";
import { rewrite, next } from "@vercel/functions";

const PASSTHROUGH_PREFIXES = ["/css/", "/js/", "/images/"];
const PASSTHROUGH_PATHS = new Set([
  "/dashboard",
  "/coming-soon",
  "/coming-soon.html",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/tokens.css",
]);
const PREVIEW_COOKIE = "pbc_preview";

// Same public project + anon key the browser already ships in
// js/supabase-config.js; row-level security is what actually gates access.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ndoiommnmkeoukxbnobp.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "sb_publishable_u3EntIBoaYn83t3sDXaL2g_kzgnZMT8";

/* A development can have a hand-coded landing page, recorded as bespoke_path
 * on its row. Look it up rather than keeping a hardcoded map in sync — adding
 * a page is then a dashboard edit, not a deploy. Returns null on any failure;
 * the generic page then loads and redirects client-side (js/listings.js). */
async function bespokePathFor(slug) {
  const endpoint =
    SUPABASE_URL +
    "/rest/v1/developments?select=bespoke_path&slug=eq." +
    encodeURIComponent(slug) +
    "&limit=1";
  const res = await fetch(endpoint, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return (rows[0] && rows[0].bespoke_path) || null;
}

function getCookie(request, name) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Developments with a hand-built landing page supersede their generic page;
  // send that URL there permanently instead of showing the thinner one.
  // /development is where the site's own cards point; /property covers the
  // older shape of the same URL. Either way a development that has its own
  // page never renders the generic template, even from a stale cached script
  // or a bookmark. Fails open — js/listings.js redirects client-side if the
  // lookup can't run.
  if (path === "/development" || path === "/property") {
    const slug = url.searchParams.get("slug");
    if (slug) {
      try {
        const bespokePath = await bespokePathFor(slug);
        if (bespokePath) {
          return new Response(null, { status: 301, headers: { Location: bespokePath } });
        }
      } catch {
        // Supabase unreachable — fall through to the page itself.
      }
      // Every listing's own slug is its clean URL (see below); an old-style
      // /property?slug=... link consolidates there once it's confirmed above
      // not to actually be a development.
      if (path === "/property") {
        return new Response(null, { status: 301, headers: { Location: "/" + encodeURIComponent(slug) } });
      }
    }
  }

  // Districts, Intelligence, and Journal used to be separate top-level pages;
  // they're now sections within the combined Insights hub. journal-article
  // and intelligence-note were unlinked sample pages from the original
  // template, removed outright — redirected here in case a search engine
  // still has either indexed.
  const RETIRED_INDEX_PAGES = new Set([
    "/districts", "/intelligence", "/journal",
    "/journal-article", "/intelligence-note",
  ]);
  if (RETIRED_INDEX_PAGES.has(path)) {
    return new Response(null, { status: 301, headers: { Location: "/insights" } });
  }

  if (
    PASSTHROUGH_PATHS.has(path) ||
    PASSTHROUGH_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    return next();
  }

  const bypassToken = process.env.PREVIEW_BYPASS_TOKEN;
  if (bypassToken) {
    const queryToken = url.searchParams.get("preview");
    if (queryToken === bypassToken) {
      const cleanUrl = new URL(url);
      cleanUrl.searchParams.delete("preview");
      return new Response(null, {
        status: 302,
        headers: {
          Location: cleanUrl.pathname + cleanUrl.search,
          "Set-Cookie": `${PREVIEW_COOKIE}=${bypassToken}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }
    if (getCookie(request, PREVIEW_COOKIE) === bypassToken) {
      return next();
    }
  }

  let comingSoon = false;
  try {
    comingSoon = (await get("coming_soon")) === true;
  } catch {
    // Edge Config unreachable or not linked — fail open (treat as not coming
    // soon) rather than returning early, so a clean listing URL below still
    // resolves even when this lookup can't run.
  }

  if (comingSoon) {
    url.pathname = "/coming-soon";
    return rewrite(url);
  }

  // A listing's slug doubles as its own top-level URL (e.g. /one-central) —
  // unlike a development, it needs no dashboard field for this since the
  // slug already is the path. Only a single bare path segment is considered,
  // and only once it clears the site's fixed pages, so this costs a lookup
  // only for genuine listing slugs (or a bespoke development slug or a typo,
  // neither of which will match and both of which fall through to next()
  // below — a real static file or a 404 — exactly as before). Checked after
  // the coming-soon gate so a listing page can't leak while that's on.
  const RESERVED_TOP_LEVEL_PATHS = new Set([
    "/", "/about", "/article", "/coming-soon", "/coming-soon.html", "/contact",
    "/dashboard", "/dashboard-manifest.json", "/dashboard-sw.js", "/developer",
    "/development", "/district", "/favicon.ico", "/foreign-buyers", "/insights",
    "/legal", "/presentation", "/properties", "/property", "/robots.txt",
    "/sellers", "/sitemap.xml", "/tokens.css",
  ]);
  if (/^\/[^/]+$/.test(path) && !RESERVED_TOP_LEVEL_PATHS.has(path)) {
    try {
      const endpoint =
        SUPABASE_URL +
        "/rest/v1/listings?select=slug&slug=eq." +
        encodeURIComponent(path.slice(1)) +
        "&published=eq.true&limit=1";
      const res = await fetch(endpoint, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
      });
      const rows = res.ok ? await res.json() : [];
      if (rows[0]) {
        url.pathname = "/property";
        return rewrite(url);
      }
    } catch {
      // Supabase unreachable — fall through to normal static routing.
    }
  }

  return next();
}

export const config = {
  runtime: "edge",
};
