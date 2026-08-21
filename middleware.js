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

  // Developments with a bespoke landing page supersede their generic listing
  // page; send that URL there permanently instead of showing the thinner one.
  const BESPOKE_DEV_PAGES = {
    "ongpin-tower": "/ongpin-tower",
    "laya-by-shang-properties": "/laya-by-shang",
    "botanika-nature-residences": "/botanika-tower-one",
    "two-botanika-nature-residences": "/two-botanika",
    "1001-parkway-residences": "/1001-parkway",
    "the-observatory": "/the-observatory",
    "yume-at-riverpark": "/yume-at-riverpark",
  };
  if (path === "/property") {
    const bespokePath = BESPOKE_DEV_PAGES[url.searchParams.get("slug")];
    if (bespokePath) {
      return new Response(null, { status: 301, headers: { Location: bespokePath } });
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
