// Vercel Routing Middleware — fronts the public site with coming-soon.html
// when the "coming_soon" Edge Config flag is true. Flip it in the Vercel
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
  "/coming-soon.html",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
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

  url.pathname = "/coming-soon.html";
  return rewrite(url);
}

export const config = {
  runtime: "edge",
};
