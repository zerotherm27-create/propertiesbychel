// Vercel Routing Middleware — fronts the public site with coming-soon.html
// when the "coming_soon" Edge Config flag is true. Flip it in the Vercel
// dashboard (Storage → Edge Config) or `vercel edge-config update` — takes
// effect immediately, no redeploy needed.
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

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (
    PASSTHROUGH_PATHS.has(path) ||
    PASSTHROUGH_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    return next();
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
