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
 * the generic page then loads and redirects client-side (js/listings.js).
 * Selects the fields the generic page's meta tags need too, since a
 * development with no bespoke page still needs correct per-item meta tags
 * on the template it does render. */
async function developmentFor(slug) {
  const endpoint =
    SUPABASE_URL +
    "/rest/v1/developments?select=name,bespoke_path,meta_description,tagline,overview,hero_image_url,location_label&slug=eq." +
    encodeURIComponent(slug) +
    "&limit=1";
  const res = await fetch(endpoint, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

function escapeHtmlAttr(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// property.html/development.html/article.html are static files carrying
// generic placeholder meta tags (real content loads client-side via
// js/listings.js / js/articles.js) — fine for a browser, but a link-preview
// bot (Facebook, Twitter/X, LinkedIn, WhatsApp, Slack) and most crawlers
// never run that JS, so a shared link to a specific listing/development/
// article always showed the same generic title, description, and site
// logo. This patches the already-rendered static HTML with the real
// per-item values (and adds JSON-LD) before it ever reaches the browser,
// via plain string replacement against the tags those templates already
// carry — no template engine, no build step, matches this repo's static
// site + client-JS-hydration pattern everywhere else.
function patchMetaTags(html, meta) {
  const esc = escapeHtmlAttr;
  let out = html;
  const set = (pattern, value) => { out = out.replace(pattern, value); };
  if (meta.title) set(/<title[^>]*>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
  if (meta.description) {
    set(/(<meta[^>]*name="description"[^>]*content=")[^"]*(")/, `$1${esc(meta.description)}$2`);
    set(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(meta.description)}$2`);
    set(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(meta.description)}$2`);
  }
  if (meta.url) {
    set(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(meta.url)}$2`);
    set(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(meta.url)}$2`);
  }
  if (meta.title) {
    set(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(meta.title)}$2`);
    set(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(meta.title)}$2`);
  }
  if (meta.image) {
    set(/(<meta property="og:image" content=")[^"]*(")/, `$1${esc(meta.image)}$2`);
    set(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${esc(meta.image)}$2`);
  }
  if (meta.jsonLd) {
    // Escape sequences that would otherwise let JSON-LD content break out of
    // the <script> element (e.g. a title/overview containing "</script>").
    const safeJson = JSON.stringify(meta.jsonLd)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    out = out.replace("</head>", `<script type="application/ld+json">${safeJson}</script></head>`);
  }
  return out;
}

async function servePatchedTemplate(request, templatePath, meta) {
  const templateUrl = new URL(templatePath, request.url);
  const res = await fetch(templateUrl);
  if (!res.ok) return null;
  const html = await res.text();
  return new Response(patchMetaTags(html, meta), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// sitemap.xml was a static file listing only the fixed marketing pages —
// every listing, development, and article (the site's actual content, and
// the pages most worth a search engine discovering directly rather than
// only via internal-link crawling) was invisible to it. Generated fresh on
// each request rather than cached/pre-built, matching this repo's no-build
// step convention; sitemap fetches are infrequent enough that the extra
// Supabase round-trip is a non-issue.
const STATIC_SITEMAP_PAGES = [
  { path: "/", priority: "1.0" },
  { path: "/properties", priority: "0.9" },
  { path: "/insights", priority: "0.8" },
  { path: "/about", priority: "0.8" },
  { path: "/developer", priority: "0.7" },
  { path: "/sellers", priority: "0.7" },
  { path: "/foreign-buyers", priority: "0.7" },
  { path: "/presentation", priority: "0.7" },
  { path: "/district", priority: "0.6" },
  { path: "/contact", priority: "0.5" },
  { path: "/legal", priority: "0.2" },
];

function sitemapUrlXml(loc, priority) {
  return `<url><loc>${loc}</loc><priority>${priority}</priority></url>`;
}

async function buildSitemap() {
  const base = "https://www.propertiesbychel.com";
  const entries = STATIC_SITEMAP_PAGES.map((p) => sitemapUrlXml(base + p.path, p.priority));

  try {
    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY };
    const [listingsRes, devsRes, articlesRes] = await Promise.all([
      fetch(SUPABASE_URL + "/rest/v1/listings?select=slug&published=eq.true", { headers }),
      fetch(SUPABASE_URL + "/rest/v1/developments?select=slug,bespoke_path&published=eq.true", { headers }),
      fetch(SUPABASE_URL + "/rest/v1/articles?select=slug&status=eq.published", { headers }),
    ]);
    const listings = listingsRes.ok ? await listingsRes.json() : [];
    const devs = devsRes.ok ? await devsRes.json() : [];
    const articles = articlesRes.ok ? await articlesRes.json() : [];

    // A listing's own slug is its clean URL (see the rewrite below).
    listings.forEach((l) => entries.push(sitemapUrlXml(base + "/" + encodeURIComponent(l.slug), "0.85")));
    // A development with a bespoke page is listed at that real path; one
    // without still gets the generic template's URL rather than being
    // omitted entirely.
    devs.forEach((d) => entries.push(sitemapUrlXml(
      base + (d.bespoke_path || "/development?slug=" + encodeURIComponent(d.slug)), "0.85"
    )));
    articles.forEach((a) => entries.push(sitemapUrlXml(base + "/article?slug=" + encodeURIComponent(a.slug), "0.7")));
  } catch {
    // Supabase unreachable — still return the static pages rather than fail outright.
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${entries.join("\n  ")}\n</urlset>\n`;
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

  if (path === "/sitemap.xml") {
    const xml = await buildSitemap();
    return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
  }

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
        const dev = await developmentFor(slug);
        if (dev && dev.bespoke_path) {
          return new Response(null, { status: 301, headers: { Location: dev.bespoke_path } });
        }
        if (dev && path === "/development") {
          const pageUrl = "https://www.propertiesbychel.com/development?slug=" + encodeURIComponent(slug);
          const title = dev.name + " · Properties by Chel";
          const description = dev.meta_description || dev.tagline || dev.overview ||
            "A featured development from Properties by Chel, a discreet real-estate advisory in the Philippines.";
          const patched = await servePatchedTemplate(request, "/development", {
            url: pageUrl,
            title,
            description,
            image: dev.hero_image_url || null,
            jsonLd: {
              "@context": "https://schema.org",
              "@type": "RealEstateListing",
              name: dev.name,
              description,
              url: pageUrl,
              ...(dev.hero_image_url ? { image: dev.hero_image_url } : {}),
              ...(dev.location_label ? { areaServed: dev.location_label } : {}),
            },
          });
          if (patched) return patched;
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

  // article.html renders a specific article via client-side JS
  // (js/articles.js), same as the property/development templates — a
  // link-preview bot or crawler needs the real title/description/image
  // patched in before that script ever runs.
  if (path === "/article") {
    const slug = url.searchParams.get("slug");
    if (slug) {
      try {
        const endpoint =
          SUPABASE_URL +
          "/rest/v1/articles?select=title,dek,meta_description,hero_image_url,section,published_at&slug=eq." +
          encodeURIComponent(slug) +
          "&status=eq.published&limit=1";
        const res = await fetch(endpoint, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
        });
        const rows = res.ok ? await res.json() : [];
        const article = rows[0];
        if (article) {
          const pageUrl = "https://www.propertiesbychel.com/article?slug=" + encodeURIComponent(slug);
          const title = article.title + " · Properties by Chel";
          const description = article.meta_description || article.dek ||
            "Market intelligence and journal essays from Properties by Chel, a discreet real-estate advisory in the Philippines.";
          const patched = await servePatchedTemplate(request, "/article", {
            url: pageUrl,
            title,
            description,
            image: article.hero_image_url || null,
            jsonLd: {
              "@context": "https://schema.org",
              "@type": "Article",
              headline: article.title,
              description,
              url: pageUrl,
              ...(article.hero_image_url ? { image: article.hero_image_url } : {}),
              ...(article.published_at ? { datePublished: article.published_at } : {}),
              author: { "@type": "Person", name: "Chel Cruzado" },
              publisher: { "@type": "Organization", name: "Properties by Chel" },
            },
          });
          if (patched) return patched;
        }
      } catch {
        // Supabase unreachable — fall through to the page itself.
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
        "/rest/v1/listings?select=title,meta_description,overview,hero_image_url,price_display,location_label&slug=eq." +
        encodeURIComponent(path.slice(1)) +
        "&published=eq.true&limit=1";
      const res = await fetch(endpoint, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
      });
      const rows = res.ok ? await res.json() : [];
      const listing = rows[0];
      if (listing) {
        const pageUrl = "https://www.propertiesbychel.com" + path;
        const title = listing.title + " · Private Presentation · Properties by Chel";
        const description = listing.meta_description || listing.overview ||
          "A private property presentation from Properties by Chel, a discreet real-estate advisory in the Philippines.";
        const patched = await servePatchedTemplate(request, "/property", {
          url: pageUrl,
          title,
          description,
          image: listing.hero_image_url || null,
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "RealEstateListing",
            name: listing.title,
            description,
            url: pageUrl,
            ...(listing.hero_image_url ? { image: listing.hero_image_url } : {}),
            ...(listing.location_label ? { areaServed: listing.location_label } : {}),
            ...(listing.price_display ? { additionalProperty: { "@type": "PropertyValue", name: "price", value: listing.price_display } } : {}),
          },
        });
        if (patched) return patched;
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
