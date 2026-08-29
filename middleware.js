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
    }
  }

  // Districts, Intelligence, and Journal used to be separate top-level pages;
  // they're now sections within the combined Insights hub.
  const RETIRED_INDEX_PAGES = new Set(["/districts", "/intelligence", "/journal"]);
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
    // Edge Config unreachable or not linked — fail open so the real site stays up.
    return next();
  }

  if (!comingSoon) return next();

  url.pathname = "/coming-soon";
  return rewrite(url);
}

export const config = {
  runtime: "edge",
};
