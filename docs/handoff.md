# Handoff — Cinematic hero walkthrough

Covers the work done on the homepage hero (`index.html`) and related nav/spacing fixes.
Two commits on `main`:

- [`577c2cf`](https://github.com/zerotherm27-create/propertiesbychel/commit/577c2cf) — full-bleed scroll-scrubbed walkthrough, contrast scrim, eyebrow copy/color, nav overlay type scale
- [`5e91536`](https://github.com/zerotherm27-create/propertiesbychel/commit/5e91536) — hero headline spacing below the nav bar, `site.css` cache-bust bump

## What was built

The homepage hero (`.cine` in [index.html](../index.html)) now plays a scroll-scrubbed
"walkthrough" instead of showing one static photo:

- **Video source**: an atmospheric brand-mood clip generated via the Motion tool (calm
  gimbal glide: shaded corridor → veranda → garden/lake). It's deliberately generic —
  not a depiction of any real, specific listing — since the site had no real walkthrough
  footage. **This constraint matters**: don't reuse this footage anywhere it could be
  read as documenting an actual property (e.g. `property.html`), and don't caption it as
  a real listing anywhere.
- **Frame extraction**: 80 JPEG frames (`images/hero-sequence/frame-001.jpg` …
  `frame-080.jpg`), 1280px wide, ~3.8MB total, via:
  ```bash
  ffmpeg -i <source.mp4> -vf "fps=10,scale=1280:-2" -q:v 6 images/hero-sequence/frame-%03d.jpg
  ```
  The original source `.mp4` was never committed (it lived in the user's local
  Downloads folder) — only the extracted frames are in the repo. If the footage needs
  to change, it has to be regenerated or re-supplied from scratch.
- **Playback**: [js/hero-sequence.js](../js/hero-sequence.js) preloads the frames
  progressively (first frame eager, rest in the background) and draws the current
  frame to a `<canvas class="cine__sequence">` with cover-fit sizing. It exposes
  `window.heroSequence.setProgress(p)`.
- **Wiring**: [js/site.js](../js/site.js)'s existing scroll-progress loop (`frame()`)
  calls `heroSequence.setProgress(p)` using the same `p` (0–1 across the hero's 300vh
  scroll track) that already drove the headline exit and CTA arrival — so scroll
  position maps directly to how far into the space you've "walked."
- **Progressive enhancement / fallback**: the sequence only skips entirely when
  `prefers-reduced-motion` or `navigator.connection.saveData` is set — otherwise the hero
  silently stays on the original static photo + CSS Ken Burns drift, no code path change
  needed, this was true before the walkthrough existed too.
- **Two frame-set tiers**: below `min-width: 800px`, `js/hero-sequence.js` swaps to a
  lighter set — 40 frames at 720px (`images/hero-sequence-mobile/`, ~956KB) instead of 80
  frames at 1280px (`images/hero-sequence/`, ~3.8MB) — via:
  ```bash
  ffmpeg -i <source.mp4> -vf "fps=5,scale=720:-2" -q:v 6 images/hero-sequence-mobile/frame-%03d.jpg
  ```
  The tier is picked once at script load; it doesn't re-evaluate if you resize/rotate
  across the 800px boundary mid-session (matches how most implementations like this
  behave — avoids re-downloading a different set mid-scroll).
- **Full-bleed from load**: the hero used to grow from a small framed box into
  full-bleed as you scrolled (bordered plate, gold corner brackets). That was dropped —
  the media now fills the screen from the very first frame, per a later request in this
  build. The corner-bracket/border CSS and the JS box-sizing math were removed as dead
  code along with it.
- **Contrast**: `.cine__veil` is now a *permanent* top+bottom gradient scrim (not
  scroll-triggered), and `.cine__close` (the lede + CTA block) has its own extra-dark
  gradient plus boosted button/link border opacity, scoped to `.cine__close` only so the
  shared `.btn--on-dark` / `.link-line--on-dark` styles used elsewhere on the site (on
  flat dark sections) are untouched. This was needed because some walkthrough frames are
  quite bright (garden/sky) and the original single scroll-tied gradient wasn't reliably
  dark enough under text in every frame.
- **Copy**: hero eyebrow is now "Private Real Estate Advisory" (dropped "· Philippines"),
  in `--on-espresso` (white-ish) instead of the gold `--brass-deep` it used before —
  needed since the backdrop is now always the photo/video, not a light page background.
- **Nav overlay**: `.menu-overlay__list` link type was scaling up to ~3rem on
  tablet/mobile widths, turning the full-page mobile menu into a wall of oversized
  serif text. Reduced the clamp (`clamp(1.75rem, 6vw, 3rem)` →
  `clamp(1.25rem, 3.6vw, 1.875rem)`) and widened the item gap.
- **Hero/nav spacing**: `.cine__title`'s `padding-top` was a flat `16vh`, which on short
  mobile viewports left the eyebrow/headline almost touching the fixed masthead. Changed
  to `calc(6.5rem + 6vh)` so there's a guaranteed rem-based floor regardless of viewport
  height, plus proportional room on taller screens.

## Files touched

- `index.html` — `<canvas class="cine__sequence">` added inside `.cine__media`;
  `.cine__paper` div removed; eyebrow copy changed; `site.css` version bump
- `css/site.css` — hero (`.cine*`) rules substantially reworked; `.menu-overlay__list`
  type scale
- `js/site.js` — `frame()` simplified (removed plate-resize math, paper/veil opacity
  tweening); one new call into `heroSequence.setProgress(p)`
- `js/hero-sequence.js` — new module (frame preload + canvas draw, two-tier frame set)
- `images/hero-sequence/*.jpg` — new, 80 frames (desktop/tablet ≥800px)
- `images/hero-sequence-mobile/*.jpg` — new, 40 frames (<800px)
- All other `*.html` pages — only a `site.css?v=` cache-bust bump (they share the
  stylesheet but don't use `.cine*`)

## Known limitations / things to check

- **Verification was partly synthetic.** The browser preview pane used during this
  build throttles `requestAnimationFrame` when it isn't the focused/rendered tab, so the
  live scroll-scrub couldn't be watched end-to-end in real time. It was verified instead
  by manually driving `heroSequence.setProgress()` and the entrance classes via JS and
  screenshotting each state. **Do a real scroll test in an actual browser/device before
  fully trusting this**, especially scroll-jank/perf on lower-end mobile.
- **Poster fallback image is still the placeholder.** The `<img data-setting-img="hero_image">`
  poster (used for reduced-motion, narrow viewports, and while frames preload) is still
  the original googleusercontent/AIDA prototype URL, not an owned asset — this predates
  this build and wasn't in scope, but it's the thing every non-walkthrough visitor
  actually sees, so it's worth swapping via the dashboard's `hero_image` upload.
- **Payload budget**: ~3.8MB desktop / ~956KB mobile, loaded lazily/idle after the first
  frame in both tiers. Wasn't checked against a real Lighthouse run or a throttled 3G
  profile — worth doing before calling performance fully verified, especially the mobile
  tier now that it actually ships to phones.

## Not pursued (discussed, deliberately skipped)

Early in this build, alternative "make it cinematic" directions were scoped and
explicitly not chosen once the walkthrough concept was picked: film grain/vignette
texture, letterbox bars, cursor-driven parallax, kinetic word-by-word title reveal. None
of that code exists — if revisited later, treat it as new work, not something half-built
to finish.

## Possible future work

- CMS/dashboard support for replacing the walkthrough (currently the frame sequence is
  hardcoded static files — there's no admin upload path for it the way `hero_image`
  has one via Supabase).
- Real property footage, if/when actual walkthrough video of a specific listing exists —
  would need its own contrast/veil tuning pass since it wasn't shot with this treatment
  in mind.
- Re-check the `--rule`/border and corner-bracket brand motif (used elsewhere via
  `.frame--corners`) that was dropped from the hero when it went full-bleed — confirm
  its absence here doesn't read as inconsistent with the rest of the site.
