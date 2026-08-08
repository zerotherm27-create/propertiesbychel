# Listing Description Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click AI drafting of a listing's on-page overview and search meta description in the dashboard, plus fixing per-listing SEO metadata (title/canonical/og/twitter) on the public property page, which currently ships identical and wrong for every listing.

**Architecture:** Extends the existing content-agent pattern used for articles (`server/lib/articles.js`, shared `STYLE_GUIDE`) with a new single-turn (no web search) endpoint `POST /generate-listing-description`. Dashboard gets a "Draft with AI" button that fills form fields for review before save, mirroring the article editor's `#ai-draft-btn` exactly. The public `property.html` page gets its `<title>`/canonical/og/twitter tags set dynamically from the fetched listing row in `js/listings.js`, same file that already sets `document.title`.

**Tech Stack:** Vanilla JS (no framework, no build step), Express server on Railway (`server/`), OpenAI Responses API, Supabase (Postgres + Storage + Auth), static HTML/CSS site on Vercel.

## Global Constraints

- No web search for this endpoint — draft entirely from data already on the listing form (per spec, unlike the article generator).
- Soft character-count warning only on meta description (>160 chars) — never block saving. The site trusts the owner's judgment elsewhere in the dashboard; don't introduce a hard block here.
- Reuse the shared `STYLE_GUIDE` from `server/lib/style.js` verbatim — no em/en dashes, no promotional language, no listicle framing. Do not write a separate style guide for listings.
- Nothing auto-publishes or auto-saves. The AI draft only fills form fields; the owner still clicks "Save listing" themselves, same as the article flow.
- Follow existing file boundaries: server logic in `server/lib/*.js` + `server/index.js`, dashboard logic in `js/dashboard.js` (not `js/dashboard-content.js`, which is only for articles), public rendering in `js/listings.js`. Don't introduce a new shared module — the codebase already tolerates small duplication between `dashboard.js` and `dashboard-content.js` (each defines its own `AGENT_URL`/`authHeader`); follow that same convention rather than refactoring it away.

---

### Task 1: Add `meta_description` column to the listings table

**Files:**
- Modify: `supabase/schema.sql:24` (add column to `CREATE TABLE`), `supabase/schema.sql:44` (add idempotent `ALTER TABLE`)
- Live DB: Supabase project `ndoiommnmkeoukxbnobp` (apply via MCP)

**Interfaces:**
- Produces: `listings.meta_description` (nullable `text` column), consumed by Task 6 (dashboard save/load) and Task 7 (public page).

- [ ] **Step 1: Update the CREATE TABLE block**

In `supabase/schema.sql`, in the `public.listings` table definition, change:

```sql
  price_display  text,
  overview       text,
  hero_image_url text,
```

to:

```sql
  price_display  text,
  overview       text,
  meta_description text,
  hero_image_url text,
```

- [ ] **Step 2: Add the idempotent ALTER TABLE line**

Immediately below the existing three `alter table public.listings add column if not exists ...` lines (around line 44), add a fourth:

```sql
alter table public.listings add column if not exists meta_description text;
```

So that block reads:

```sql
alter table public.listings add column if not exists map_lat double precision;
alter table public.listings add column if not exists map_lng double precision;
alter table public.listings add column if not exists location_features jsonb not null default '[]'::jsonb;
alter table public.listings add column if not exists meta_description text;
```

- [ ] **Step 3: Apply the migration to the live database**

Use the Supabase MCP tool against project `ndoiommnmkeoukxbnobp`:

```
mcp__<supabase>__apply_migration
  project_id: ndoiommnmkeoukxbnobp (or whatever id list_projects/list_tables resolves it to)
  name: add_listing_meta_description
  query: alter table public.listings add column if not exists meta_description text;
```

- [ ] **Step 4: Verify the column exists**

Run (via the same Supabase MCP, `execute_sql` or `list_tables` with column detail), or via a quick browser check against the REST API:

```js
fetch('https://ndoiommnmkeoukxbnobp.supabase.co/rest/v1/listings?select=meta_description&limit=1', {headers:{apikey: window.SUPABASE_CONFIG.anonKey}}).then(r=>r.json()).then(console.log)
```

Expected: `[{ "meta_description": null }]` (or similar), not a 400/column-not-found error.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add meta_description column to listings

Backs the new AI-generated search-results description, wired into
the dashboard editor and the public property page's meta tags in
follow-up commits."
```

---

### Task 2: Add listing voice guidance to the shared style guide

**Files:**
- Modify: `server/lib/style.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LISTING_VOICE` (exported string constant), consumed by Task 3.

- [ ] **Step 1: Add the export**

In `server/lib/style.js`, immediately after the `sectionVoice` function (after its closing `}`), add:

```js
export const LISTING_VOICE = `Section voice: Listing description. Two distinct outputs, both grounded strictly in the facts supplied below, nothing invented (no addresses, amenities, or history not stated). Write connected prose the way a considered advisory writes about a residence, never a listicle or a specs dump ("4BR, 2CR, 1 parking"). The overview and the meta description must not read as the same sentence twice.`;
```

- [ ] **Step 2: Verify it loads without a syntax error**

```bash
node -e "import('./server/lib/style.js').then(m => console.log(typeof m.LISTING_VOICE === 'string' && m.LISTING_VOICE.length > 0))"
```

Expected: `true`

- [ ] **Step 3: Commit**

```bash
git add server/lib/style.js
git commit -m "Add LISTING_VOICE guidance to the shared style guide"
```

---

### Task 3: Add the listing description drafting function

**Files:**
- Create: `server/lib/listings.js`

**Interfaces:**
- Consumes: `STYLE_GUIDE`, `LISTING_VOICE` from `./style.js`; `stripDashesDeep` from `./style.js`.
- Produces: `draftListingDescription(openai, { title, location_label, price_display, meta_line, features, notes })` → `Promise<{ overview: string, meta_description: string }>`, consumed by Task 4.

- [ ] **Step 1: Write the file**

```js
import { STYLE_GUIDE, LISTING_VOICE, stripDashesDeep } from "./style.js";

const DRAFT_MODEL = "gpt-5.6";

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model did not return a parseable JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function featuresBlock(features) {
  if (!Array.isArray(features) || !features.length) return "(none given)";
  return features.map((f) => `${f.label}: ${f.value}`).join("\n");
}

export async function draftListingDescription(openai, { title, location_label, price_display, meta_line, features, notes }) {
  const prompt = `${STYLE_GUIDE}

${LISTING_VOICE}

Write for this specific listing. Use only the facts given below.

Title: ${title}
Location: ${location_label || "(not given)"}
Price: ${price_display || "(not given)"}
Card meta line: ${meta_line || "(not given)"}
Nearby features:
${featuresBlock(features)}
Additional notes from the owner: ${notes || "(none)"}

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "overview": "2 to 3 sentences of on-page prose introducing this residence, in the voice above",
  "meta_description": "one plain sentence, 120 to 155 characters, written for a search-results snippet, distinct in wording from the overview"
}`;

  const response = await openai.responses.create({
    model: DRAFT_MODEL,
    input: prompt
  });

  const draft = extractJson(response.output_text);
  return stripDashesDeep({
    overview: draft.overview || "",
    meta_description: draft.meta_description || ""
  });
}
```

- [ ] **Step 2: Verify the pure helpers behave correctly**

```bash
node -e "
const mod = await import('./server/lib/listings.js');
" 2>&1 | head -5
```

Expected: no import error (confirms syntax is valid and `./style.js` resolves). This file has no exported pure helpers to unit-test in isolation (`extractJson`/`featuresBlock` are private) — the meaningful test is Task 4's live endpoint call, since `draftListingDescription` itself requires a real OpenAI client.

- [ ] **Step 3: Commit**

```bash
git add server/lib/listings.js
git commit -m "Add draftListingDescription, mirroring the article drafting pattern

Single-turn (no web search, unlike articles): the listing form already
has the facts, so there's nothing to research."
```

---

### Task 4: Wire the `/generate-listing-description` endpoint

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `draftListingDescription` from `./lib/listings.js` (Task 3).
- Produces: `POST /generate-listing-description` HTTP endpoint, consumed by Task 6.

- [ ] **Step 1: Add the import**

In `server/index.js`, alongside the existing `generateArticle` import, add:

```js
import { draftListingDescription } from "./lib/listings.js";
```

So the top of the file reads:

```js
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { requireOwner } from "./lib/auth.js";
import { generateArticle } from "./lib/articles.js";
import { generateImage } from "./lib/images.js";
import { draftBriefing } from "./lib/briefings.js";
import { renderBriefingHtml, htmlToPdfBuffer } from "./lib/briefing-pdf.js";
import { draftListingDescription } from "./lib/listings.js";
```

- [ ] **Step 2: Add the route**

Immediately after the existing `/generate-article` route (after its closing `});`), add:

```js
app.post("/generate-listing-description", requireOwner, async (req, res) => {
  const client = getOpenAI();
  if (!client) return res.status(503).json({ error: "OPENAI_API_KEY is not set on this server yet" });
  const { title, location_label, price_display, meta_line, features, notes } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  try {
    const draft = await draftListingDescription(client, { title, location_label, price_display, meta_line, features, notes });
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message || "Generation failed" });
  }
});
```

- [ ] **Step 3: Verify locally**

```bash
cd server && OPENAI_API_KEY=$OPENAI_API_KEY SUPABASE_URL=... SUPABASE_ANON_KEY=... OWNER_EMAIL=... node index.js
```

In another terminal, confirm the route is registered and rejects unauthenticated requests (auth wiring already proven by the identical pattern on `/generate-article`, so this only needs to confirm the new route exists):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/generate-listing-description -H "Content-Type: application/json" -d '{"title":"Test"}'
```

Expected: `401` (missing authorization — proves the route exists and `requireOwner` is wired, same as every other endpoint here). A `404` would mean the route registration is broken.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "Wire POST /generate-listing-description"
```

- [ ] **Step 5: Deploy the server**

This project's content-agent server deploys to Railway from this same repo (per `js/supabase-config.js`'s `contentAgentUrl`). Push to whatever branch/remote triggers that deploy (same mechanism already used for `/generate-article` etc. — no new deploy config needed since this is just a new route on the existing app).

---

### Task 5: Add the dashboard UI

**Files:**
- Modify: `dashboard.html:165` (listing form)

**Interfaces:**
- Produces: `#listing-ai-draft-btn`, `#listing-ai-status`, `form.elements.listing_notes`, `form.elements.meta_description`, `#listing-meta-count` — all consumed by Task 6.

- [ ] **Step 1: Insert the new fields and button**

In `dashboard.html`, the Overview field currently reads:

```html
        <div class="field"><label>Overview (shown on the property page)</label><textarea name="overview" rows="4" placeholder="Two or three considered sentences."></textarea></div>
        <div class="field">
          <label>Map location</label>
```

Change it to:

```html
        <div class="field"><label>Overview (shown on the property page)</label><textarea name="overview" rows="4" placeholder="Two or three considered sentences."></textarea></div>
        <div class="field"><label>Anything else to mention? (optional)</label><input name="listing_notes" placeholder="e.g. corner unit, renovated 2024, park view"></div>
        <button class="btn" type="button" id="listing-ai-draft-btn">Draft with AI</button>
        <p class="field__note" id="listing-ai-status"></p>
        <div class="field"><label>Meta description (for search results)</label>
          <textarea name="meta_description" rows="2" placeholder="One sentence for search results, 120 to 155 characters."></textarea>
          <p class="field__note" id="listing-meta-count">0 / 160</p>
        </div>
        <div class="field">
          <label>Map location</label>
```

Note: `listing_notes` is deliberately never read from or written to a saved listing (Task 6's `openEditor` and submit payload both leave it alone) — it only steers the AI draft for the current session, matching the design's "ephemeral, not persisted" decision.

- [ ] **Step 2: Add the over-limit color rule**

In `css/site.css`, immediately after the existing `.field__error` rule (`.field__error { font-size: var(--text-sm); color: var(--brass-deep); margin: 0; }`), add:

```css
#listing-meta-count.is-over { color: var(--brass-deep); }
```

(Reuses the site's single accent color already used for `.field__error` — the design system has no separate red/amber, so this collapses to a two-state neutral/warn indicator rather than three colors.)

- [ ] **Step 3: Verify visually**

Open `dashboard.html` locally (or via the live dashboard), open the listing editor, confirm: the notes field, "Draft with AI" button, status line, and meta description field with "0 / 160" counter all render in the expected order, above the existing Map location field.

- [ ] **Step 4: Commit**

```bash
git add dashboard.html css/site.css
git commit -m "Add listing description AI-draft UI to the dashboard"
```

---

### Task 6: Wire the dashboard behavior

**Files:**
- Modify: `js/dashboard.js`

**Interfaces:**
- Consumes: `#listing-ai-draft-btn`, `#listing-ai-status`, `form.elements.listing_notes`, `form.elements.meta_description`, `#listing-meta-count` (Task 5); `POST /generate-listing-description` (Task 4); `featuresFromForm()` (already defined in this file, function-hoisted so call-order doesn't matter).
- Produces: nothing new consumed elsewhere — this task's changes are the end of the dashboard-side chain.

- [ ] **Step 1: Add `AGENT_URL` and a local auth-header helper**

In `js/dashboard.js`, inside `async function init(supabase) {`, immediately before the line `const editor = $("#listing-editor");` (around line 408), add:

```js
  const AGENT_URL = (window.SUPABASE_CONFIG || {}).contentAgentUrl || "";
  async function listingAuthHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: "Bearer " + session.access_token } : {};
  }
```

(This duplicates the same-shaped constant/helper already in `js/dashboard-content.js` rather than sharing it — the two files don't currently import from each other, only communicate via the `window.DashboardContent.init(supabase, {...})` bridge, and this follows that existing convention rather than introducing a new shared module for four lines of code.)

- [ ] **Step 2: Restore `meta_description` when editing an existing listing**

In `openEditor(l)`, change:

```js
      ["title", "tag", "location_label", "meta_line", "price_display", "overview", "hero_image_url"].forEach((k) => { form.elements[k].value = l[k] || ""; });
```

to:

```js
      ["title", "tag", "location_label", "meta_line", "price_display", "overview", "hero_image_url", "meta_description"].forEach((k) => { form.elements[k].value = l[k] || ""; });
      updateMetaCount();
```

(`updateMetaCount` is defined in Step 3 below as a function declaration in the same `init` scope, so it's hoisted and safe to call here regardless of textual order.)

- [ ] **Step 3: Add the character counter and its input listener**

Immediately after the `$("#listing-photo-url").addEventListener(...)` block (the one that previews a pasted photo URL, a few lines below `openEditor`), add:

```js
  function updateMetaCount() {
    const n = form.elements.meta_description.value.length;
    const el = $("#listing-meta-count");
    el.textContent = n + " / 160";
    el.classList.toggle("is-over", n > 160);
  }
  form.elements.meta_description.addEventListener("input", updateMetaCount);
```

- [ ] **Step 4: Add the "Draft with AI" click handler**

Immediately after the block from Step 3, add:

```js
  $("#listing-ai-draft-btn").addEventListener("click", async () => {
    const title = form.elements.title.value.trim();
    const status = $("#listing-ai-status");
    if (!title) { status.textContent = "Enter a title first."; return; }
    if (!AGENT_URL) { status.textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
    status.textContent = "Drafting…";
    $("#listing-ai-draft-btn").disabled = true;
    try {
      const headers = { "Content-Type": "application/json", ...(await listingAuthHeader()) };
      const body = JSON.stringify({
        title,
        location_label: form.elements.location_label.value.trim(),
        price_display: form.elements.price_display.value.trim(),
        meta_line: form.elements.meta_line.value.trim(),
        features: featuresFromForm(),
        notes: form.elements.listing_notes.value.trim()
      });
      const r = await fetch(AGENT_URL + "/generate-listing-description", { method: "POST", headers, body });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Draft failed");
      form.elements.overview.value = data.overview || "";
      form.elements.meta_description.value = data.meta_description || "";
      updateMetaCount();
      status.textContent = "Draft ready. Review below, then save.";
    } catch (ex) {
      status.textContent = "Could not draft: " + (ex.message || ex);
    } finally {
      $("#listing-ai-draft-btn").disabled = false;
    }
  });
```

- [ ] **Step 5: Save `meta_description` on submit**

In the `form.addEventListener("submit", ...)` handler, change:

```js
        overview: form.elements.overview.value.trim() || null,
        hero_image_url: form.elements.hero_image_url.value || null,
```

to:

```js
        overview: form.elements.overview.value.trim() || null,
        meta_description: form.elements.meta_description.value.trim() || null,
        hero_image_url: form.elements.hero_image_url.value || null,
```

- [ ] **Step 6: Verify end-to-end in the dashboard**

With the Task 4 server deployed and `OPENAI_API_KEY` set on it:

1. Open the dashboard, sign in, open an existing listing (or create one) and fill in Title, Location label, Price display, Card meta line.
2. Click "Draft with AI". Expected: status line shows "Drafting…" then "Draft ready...", Overview and Meta description fields populate, counter updates to match the generated text's length.
3. Edit the generated text, click "Save listing". Expected: no error, editor closes.
4. Click "Edit" on that same listing again. Expected: Overview and Meta description show the saved (edited) text, counter reflects it.
5. Type a meta description over 160 characters by hand. Expected: counter turns the accent color; "Save listing" still succeeds (no hard block).

- [ ] **Step 7: Commit**

```bash
git add js/dashboard.js
git commit -m "Wire the listing description AI-draft button and meta_description save/load"
```

---

### Task 7: Wire per-listing SEO metadata on the public property page

**Files:**
- Modify: `js/listings.js:112` (property detail render)

**Interfaces:**
- Consumes: `l.slug`, `l.title`, `l.location_label`, `l.meta_description` (all already present on the fetched listing row; `meta_description` from Task 1/6).
- Produces: nothing consumed elsewhere — this is the final rendering step of the chain.

- [ ] **Step 1: Add the tag-setting logic**

In `js/listings.js`, immediately after the existing line:

```js
      document.title = l.title + " · Private Presentation · Properties by Chel";
```

add:

```js
      var setMeta = function (selector, attr, value) {
        var el = document.querySelector(selector);
        if (el && value) el.setAttribute(attr, value);
      };
      var pageUrl = "https://www.propertiesbychel.com/property?slug=" + encodeURIComponent(l.slug);
      var pageTitle = l.title + (l.location_label ? ", " + l.location_label : "") + " · Private Presentation · Properties by Chel";
      setMeta('link[rel="canonical"]', "href", pageUrl);
      setMeta('meta[property="og:url"]', "content", pageUrl);
      setMeta('meta[property="og:title"]', "content", pageTitle);
      setMeta('meta[name="twitter:title"]', "content", pageTitle);
      if (l.meta_description) {
        setMeta('meta[name="description"]', "content", l.meta_description);
        setMeta('meta[property="og:description"]', "content", l.meta_description);
        setMeta('meta[name="twitter:description"]', "content", l.meta_description);
      }
```

(Uses `var`/`function` rather than `const`/arrow, matching this file's existing style — the rest of `listings.js` is written in the older `var`/`function` idiom, not `const`/arrow functions. The description/og:description/twitter:description tags are only overwritten when `l.meta_description` is set, so listings that predate this feature keep showing the old static fallback text rather than being blanked out.)

- [ ] **Step 2: Verify on a listing that has a meta_description set**

After Task 6's end-to-end check has saved a `meta_description` on some listing, open that listing's live page and inspect the DOM:

```js
JSON.stringify({
  title: document.title,
  canonical: document.querySelector('link[rel="canonical"]').href,
  description: document.querySelector('meta[name="description"]').content,
  ogTitle: document.querySelector('meta[property="og:title"]').content
})
```

Expected: `canonical` contains that listing's own slug (not a different one), `description` matches the saved `meta_description`, `ogTitle` contains the listing's real title and location, not "The Zenith Penthouse" / "BGC".

- [ ] **Step 3: Verify a listing without a meta_description is unaffected**

Open a listing that has never had a description generated (`meta_description` still null). Expected: `document.querySelector('meta[name="description"]').content` still shows the old static fallback text (unchanged), while `document.title` and canonical are already correct (title/canonical don't depend on `meta_description`, only on `title`/`slug`/`location_label`, which every listing already has).

- [ ] **Step 4: Commit**

```bash
git add js/listings.js
git commit -m "Set per-listing SEO metadata on the property detail page

Title, canonical, and og/twitter title were already fetched but never
applied beyond document.title, so every listing page showed identical
metadata copied from the original sample listing. Description tags
use the new meta_description field when a listing has one, and fall
back to the existing static text otherwise so nothing regresses for
listings created before this shipped."
```

---

### Task 8: Full end-to-end verification pass

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Fresh listing, full flow**

Create a brand-new listing in the dashboard with a real title, location, price, and one nearby feature. Click "Draft with AI". Confirm both fields populate with prose that doesn't repeat the same sentence shape, contains no em/en dash, and doesn't read like a spec sheet. Save. Confirm no console errors.

- [ ] **Step 2: Public page**

Open that new listing's live page. Confirm: correct `<title>`, correct meta description in page source (view-source, not just DOM, to make sure it's set before any crawler-relevant timing concern — note this is client-side JS so a crawler that doesn't execute JS still sees the old static tag; this is a known limitation of the static-site architecture, not a regression, and matches how `document.title` already behaved before this feature), correct canonical URL pointing at this listing's own slug.

- [ ] **Step 3: Regression check on an untouched listing**

Open a listing that was never edited through this feature. Confirm its page still renders normally, title/canonical are correct (data-driven, no AI needed), and its meta description still shows the pre-existing static fallback rather than a blank or broken tag.

- [ ] **Step 4: Error path**

Temporarily test with the dashboard's Title field empty and click "Draft with AI". Expected: status line reads "Enter a title first." with no network request made (open Network tab to confirm no request fired).
