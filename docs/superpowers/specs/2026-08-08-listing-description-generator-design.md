# Listing description generator — design

## Context

The dashboard's listing editor has an "Overview" field (`overview`, shown on the property page) that owners currently fill by hand or leave on a generic fallback sentence. The site already has a proven AI-drafting pattern for Journal/Intelligence articles (`server/lib/articles.js`, `server/lib/style.js`, `/generate-article`), including a shared brand `STYLE_GUIDE` and an owner-gated content-agent server. This feature extends that same pattern to listings.

While scoping this, a separate but directly related defect was found: every listing's detail page (`property.html`) ships **completely static SEO metadata** — `<title>`, `<meta name="description">`, canonical URL, and all `og:`/`twitter:` tags are hardcoded to the original sample listing ("The Zenith Penthouse... ₱320M"). `js/listings.js` updates `document.title` on load but never touches any other tag. Every real listing currently shows identical, wrong metadata in search results and link previews, regardless of which property it is. Fixing this is in scope for this feature (confirmed with the site owner) since it's what makes generated descriptions actually "SEO compliant" in the sense search engines and social previews care about.

## Goals

- One-click AI draft of a listing's on-page overview paragraph and search-facing meta description, in the site's existing editorial brand voice.
- Fix per-listing SEO metadata (title, canonical, og/twitter tags) to reflect the real listing being viewed, not the static sample.
- Match the existing dashboard UX for AI drafting (review-and-edit-before-save, not auto-publish) rather than introducing a new pattern.

## Non-goals

- No web research step (unlike articles) — listings draft entirely from data already on the form.
- No changes to the existing sample/demo listing gating logic (already fixed separately).
- No structured `bedrooms`/`sqm` columns — the generator reads the existing freeform `meta_line` field as-is.
- No floor-plan feature (raised earlier, tracked separately, not part of this spec).

## Data model

One new column:

```sql
alter table public.listings add column if not exists meta_description text;
```

No other schema changes. `overview`, `title`, `location_label`, `price_display`, `meta_line`, and `location_features` (nearby feature rows) already exist and are the generator's inputs.

## Server (content-agent)

**`server/lib/style.js`**: add a `listing` entry to voice guidance (new export or extend `sectionVoice`-style helper) describing two distinct outputs:
- `overview`: 2–3 sentences, on-page prose in the existing `STYLE_GUIDE` voice — no listicle framing, no spec-dump ("4BR, 2CR, 1 parking" style listing-aggregator tone).
- `meta_description`: exactly one plain sentence, written for a search-results snippet (concrete, specific, no promotional language), distinct wording from the overview so the two don't read as duplicates, targeting roughly 120–155 characters.

**`server/lib/listings.js`** (new): `draftListingDescription(openai, { title, location_label, price_display, meta_line, features, notes })` → `{ overview, meta_description }`. Builds a prompt from `STYLE_GUIDE` + the new listing voice block + the structured inputs (features rendered as `label: value` lines; `notes` included verbatim as "additional context" only if non-empty). Uses the same `DRAFT_MODEL`, `extractJson`, and `stripDashesDeep` helpers already in `articles.js`/`style.js`. No web search, no `extractSources` — this endpoint is single-turn.

**`server/index.js`**: add
```
app.post("/generate-listing-description", requireOwner, async (req, res) => { ... })
```
mirroring `/generate-article`'s shape exactly: lazy `getOpenAI()` check → 503 if unconfigured, validate `title` is present (400 if not, since a blank title makes the draft meaningless), call `draftListingDescription`, 502 on failure with `err.message`.

## Dashboard UI

In `dashboard.html`'s listing form, directly under the existing Overview field:

- One new small text input: "Anything else to mention? (optional)" — freeform notes, blank by default.
- A "Draft with AI" button + status line, placed the same way as the article editor's `#ai-draft-btn` / `#ai-status`.
- A new "Meta description (for search results)" textarea below Overview, with a live character counter (`142/160` style) that turns amber past 140 and red past 160 — a soft warning, not a hard block on saving, consistent with the rest of the dashboard trusting the owner's judgment.

`js/dashboard.js` (where the listing form's other handlers already live, e.g. `#listing-form` at line 409): click handler reads `title`, `location_label`, `price_display`, `meta_line`, the three `feature_label_N`/`feature_value_N` pairs, and the new notes field from the live form (no separate "topic" prompt needed, per design decision); POSTs to `AGENT_URL + "/generate-listing-description"`; on success, fills `overview` and the new `meta_description` field in place for the owner to review/edit before hitting the existing "Save listing" button; on failure, shows the error in the status line, matching the article flow's error handling. Button disables while in flight.

## Public-page SEO wiring

In `js/listings.js`, in the property-detail render block (where `document.title` is currently set), add, using only data already on the fetched row (no AI call on the public site):

- `link[rel=canonical]` → `href` set from the listing's own slug.
- `meta[property=og:url]` → same.
- `meta[property=og:title]` / `meta[name=twitter:title]` → built from `l.title` + `l.location_label`, following the exact same "`{Title}, {District} · Private Presentation · Properties by Chel`" template already used for the static fallback and consistent with every other page's title pattern on the site.
- `meta[name=description]` / `meta[property=og:description]` / `meta[name=twitter:description]` → `l.meta_description` when present; if a listing has no `meta_description` yet (not generated/saved), leave the existing static fallback text in place rather than clearing it, so nothing regresses for listings that haven't been touched.

## Error handling

- Content-agent unreachable/unconfigured: existing `AGENT_URL` empty-check pattern already used by the article flow (`"Content agent isn't configured..."`) reused verbatim.
- Generation fails server-side (OpenAI error, bad JSON): 502 with `err.message`, shown inline in the dashboard status line; form fields untouched.
- Missing title when the button is clicked: same client-side guard pattern as the article flow's `if (!topic) { ...; return; }`.
- Public page: if `l.meta_description` is null/empty, tags simply aren't overwritten (see above) — no error state needed, this is expected for listings created before this feature shipped.

## Verification

- Manually draft a description for a real listing in the dashboard, confirm overview + meta description both populate, edit one, save, confirm it persists.
- View that listing's live page, inspect `<title>`, canonical, and meta/og/twitter description tags to confirm they reflect the real listing, not the Zenith sample.
- View a listing that has never had a description generated, confirm its meta tags still show the old static fallback (no regression) while its title/canonical (data-driven, no AI needed) are already correct.
- Confirm the character counter changes color at the 140/160 thresholds and does not block saving over the limit.
