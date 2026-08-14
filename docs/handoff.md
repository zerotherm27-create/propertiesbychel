# Handoff — Ongpin Tower bespoke landing page

Covers a new, fully hand-built page (`ongpin-tower.html`, reachable at `/ongpin-tower`)
that recreates the developer's own marketing site (ongpintower.com) in the Properties
by Chel design system, plus the cross-linking and shared-component fixes that came out
of building it. Seven commits on `main`, in order:

- [`de305d4`](https://github.com/zerotherm27-create/propertiesbychel/commit/de305d4) — initial page build from a design handoff
- [`4d53637`](https://github.com/zerotherm27-create/propertiesbychel/commit/4d53637) — cross-link the page from the dashboard-managed Development/Listing pages; fix the shared gallery site-wide
- [`3a27ac6`](https://github.com/zerotherm27-create/propertiesbychel/commit/3a27ac6) — enrich unit details (sqm breakdown, 360° tours, hand-over provisions), stop routing plan clicks off-site
- [`7da7cc9`](https://github.com/zerotherm27-create/propertiesbychel/commit/7da7cc9) — 360° tours open in a popup window instead of a new tab
- [`f5c0ad4`](https://github.com/zerotherm27-create/propertiesbychel/commit/f5c0ad4) — masonry gallery layout, fix a real mobile horizontal-overflow bug
- [`6d7fdad`](https://github.com/zerotherm27-create/propertiesbychel/commit/6d7fdad) — redirect the generic listing page to this one
- [`5b14d5d`](https://github.com/zerotherm27-create/propertiesbychel/commit/5b14d5d) — per-tier interior photo lightbox galleries

Immediately before this arc, a separate but related piece of work fixed the dashboard's
"Import from URL" feature (the puppeteer/headless-render fix, floor-plan/tagline
filtering, no-auto-hero-pick) — that's what surfaced Ongpin Tower as a real test case in
the first place, and is why the dashboard-managed Development/Listing rows for Ongpin
Tower already had decent data before this page existed. Not otherwise covered here.

## What was built

**The page itself** (`ongpin-tower.html`): hero (real building exterior render + inline
YouTube film), three tier sections (Residences/Estates/Penthouse) each with stats, a
floor-plan feature image, a "Unit Types" list, and a "View Interior Gallery" trigger;
Amenities, Features, Hand-Over Provisions, Location (with a real brand-styled Google
Map), a masonry showroom-photo Gallery, and an About band. Built using only existing
site components (`.frame--corners`, `.index-row`, `.btn`, `.eyebrow`, `.grid-12`,
`css/site.css` tokens) — no new design language introduced.

**Real content, not invented.** Every fact on the page was live-crawled from
ongpintower.com rather than guessed or AI-drafted:
- All 13 units' sqm figures, interior/exterior breakdowns (11 of 13 have one; Penthouse
  A/B don't on the source either, so left blank), and bedroom counts.
- Real 360° virtual tours (Kujiale-hosted) for the 9 units that have one — clicking
  those rows opens the tour in a small popup window (`window.open`, 1100×750,
  centered); the other 4 render as plain non-interactive rows instead of a dead link.
- A "Hand-Over Provisions" section (VRF aircon, rangehood & cooktops, toilet fixtures,
  water heater) — identical across every unit on the source, so shown once, not repeated
  13 times.
- **Per-tier interior photo galleries** (`5b14d5d`) — each of Residences/Estates/
  Penthouse has its own real 5-photo interior gallery on the source (a Swiper carousel
  sitting outside the per-unit tab sections, which is why an earlier crawl pass missed
  it — it doesn't show up in a plain `<img>` scan scoped to the unit sections, and in
  Penthouse's case the *first* pass caught only a single CSS `background-image` before
  the real Swiper `<img>` gallery was found). Wired into an in-page lightbox — arrow
  keys, click-outside, focus-return-on-close.
- The real geocoded address (14.6008813, 120.980159) for the map, and the real building
  exterior render (`OT-Building-*.png`) for the hero — that render has a large flat gray
  band baked into the bottom third of the source file, since `object-fit: cover` can't
  crop it out (matching aspect ratio), so it's cropped via `transform: scale(1.7)`
  instead.

**Cross-linking.** `development.html` and `property.html` reveal a "View the full
property presentation" / "Part of Ongpin Tower" link when `slug === "ongpin-tower"`
(hardcoded check in `js/listings.js`, see Not Pursued). `middleware.js` permanently
redirects `/property?slug=ongpin-tower` to `/ongpin-tower`.

**Shared-component fixes** (discovered while building this page, fixed site-wide, not
scoped to just Ongpin Tower):
- `js/listings.js`'s `dyn-gallery-grid` (used by every listing/development detail page)
  was missing `.frame--corners` and never actually fired its reveal-on-scroll animation
  — the detail-page handlers never dispatched the `listings:rendered` event the reveal
  scanner listens for. Both fixed; the first photo now also gets featured weight
  (wider crop, spans two columns) instead of a uniform grid.
- `css/site.css`'s `.footer__social` referenced `var(--space-5)`, a token that doesn't
  exist in `tokens.css` — the footer's LinkedIn/Facebook icons had zero gap between them
  on every page in production. Fixed to `--space-4`.
- A listing linked to a development now inherits its parent's photos/overview when it
  has none of its own (`property.html` / `js/listings.js`) — this predates the Ongpin
  Tower page itself but is part of the same session's work.

## Files touched

- `ongpin-tower.html` — new, ~730 lines (structure, page-scoped `<style>`, page-scoped
  `<script>` for the video/map/lightbox/popup-tour behavior)
- `development.html`, `property.html` — one new conditional link block each
- `js/listings.js` — cross-link reveal logic, shared-gallery fixes, listing→development
  photo/overview inheritance
- `css/site.css` — shared-gallery fixes, footer gap bug fix
- `middleware.js` — the `/property?slug=ongpin-tower` redirect

## Known limitations / things to check

- **Every image on the page is hotlinked from ongpintower.com's own CDN** — hero,
  3 floor-plan feature images, 5 gallery photos, 15 lightbox-gallery photos, the
  amenities pool photo. None are self-hosted in Supabase storage. If the developer
  reorganizes or takes down their site, images break here with no warning. This was a
  deliberate speed/scope trade-off, not an oversight — see Possible Future Work.
- **No CMS/dashboard control.** Every other page on this site is data-driven from
  Supabase; this one is fully hand-coded static HTML. Any content change (a unit's sqm
  figure, a new tour link, copy) needs a direct code edit and deploy, not a dashboard
  update.
- **Content is a point-in-time snapshot** from live-crawling ongpintower.com during this
  session. If the developer updates pricing, availability, or unit specs on their own
  site, this page won't reflect it automatically.
- Two Residences units (A and E) intentionally share the same 360° tour URL — confirmed
  against the source (mirrored unit layout), not a copy-paste bug.
- The page isn't in primary nav or `/properties` — reachable via direct URL, the
  `/property?slug=ongpin-tower` redirect, and the cross-links from the Development/
  Listing pages. Deliberately deferred (see Not Pursued).
- The mobile horizontal-overflow bug fixed in `f5c0ad4` (nowrap text inside an
  auto-sized grid column) was found by testing one specific component (`.unit-row`).
  Worth a broader mobile-width sweep of the rest of the page in case the same pattern
  exists elsewhere and wasn't caught.

## Not pursued (discussed, deliberately skipped)

- **No general "bespoke page" system.** Cross-linking is a hardcoded
  `dev.slug === "ongpin-tower"` check in `js/listings.js`, not a dashboard field or a
  lookup table. Fine for one page; if a second development needs its own bespoke page,
  turn this into a small config map instead of adding a second hardcoded branch.
- **Self-hosting the ~24 hotlinked images was explicitly not done this session** — kept
  scope to content/structure/interaction, not asset migration.
- **Adding the page to primary nav or `/properties`** was raised and explicitly deferred
  by the user earlier in this build — intentional, not forgotten.

## Possible future work

- Download and re-host the hotlinked images in Supabase storage to remove the
  dependency on ongpintower.com staying up and unchanged.
- If a second development ever needs this bespoke-page treatment, generalize the
  cross-linking check in `js/listings.js` before hardcoding a third slug.
- Re-verify unit sqm/pricing/availability against the live source periodically, since
  nothing here auto-syncs.
- Confirm the Google Maps API key/quota holds up under real traffic — not
  load-tested this session.
- A broader mobile-viewport sweep of the whole page (see limitations above).
