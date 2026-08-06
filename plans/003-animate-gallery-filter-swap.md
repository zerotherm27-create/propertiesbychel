# 003 — Animate property-gallery filter swap instead of teleporting

- **Status**: DONE
- **Commit**: 7e5023c
- **Severity**: MEDIUM
- **Category**: Missed opportunity / Purpose
- **Estimated scope**: 2 files (js/site.js, css/site.css), 1 JS edit + 1 CSS addition

## Problem

`properties.html` has a filter bar (`[data-filter-group]`, "For sale" /
"Investment" / collection chips) that filters the `.plisting` cards in
`.gallery[data-listings]`. The filtering itself is instant and
unanimated — cards pop in and out of the grid with zero transition. This
is a frequently-used interaction (switching between availability/
collection filters is a core part of browsing the collection) and the
current teleport is jarring compared to the rest of the site's motion
language, which treats card layout changes as something to ease (see the
existing hover lift on the same `.plisting` element,
`css/site.css:307-308`).

Current code (`js/site.js:127-138`):

```js
/* — Gallery filters (collection page) — */
var filterbars = document.querySelectorAll("[data-filter-group]");
if (filterbars.length) {
  var state = { status: "all", collection: "all" };
  function applyFilters() {
    // queried live so dynamically rendered listings keep filtering
    document.querySelectorAll("[data-status]").forEach(function (c) {
      var okStatus = state.status === "all" || c.dataset.status === state.status;
      var okColl = state.collection === "all" || (c.dataset.collection || "").split(" ").indexOf(state.collection) !== -1;
      c.style.display = okStatus && okColl ? "" : "none";
    });
  }
  ...
```

The filtered elements are `.plisting` cards (see `js/listings.js:87-88`
and `properties.html:107`, e.g.
`<a class="plisting" ... data-status="sale" data-collection="skyline" data-reveal>`)
inside a CSS grid (`css/site.css:306`, `.gallery { display: grid; ... }`).

## Target

Swap the inline `style.display` toggle for a class toggle, and let CSS
own the transition using `transition-behavior: allow-discrete` +
`@starting-style` — the same modern-CSS approach this codebase already
relies on elsewhere (`@view-transition` at `css/site.css:7`, `:has()` at
`css/site.css:393`). This requires no JS animation logic — just a class
name instead of a style write.

```js
/* js/site.js:136 — target */
c.classList.toggle("is-filtered-out", !(okStatus && okColl));
```

```css
/* css/site.css — new rules, inserted after line 317 (end of the
   @media (min-width: 64rem) gallery block), before `.plisting { display: block; }` */
.plisting[data-status] {
  opacity: 1;
  transition: transform var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out), display var(--dur-fast) var(--ease-out) allow-discrete;
}
.plisting[data-status].is-filtered-out {
  opacity: 0;
  display: none;
}
@starting-style {
  .plisting[data-status]:not(.is-filtered-out) { opacity: 0; }
}
```

## Repo conventions to follow

- Duration/easing tokens: use `var(--dur-fast)` and `var(--ease-out)` —
  the same tokens the adjacent `.plisting { transition: transform
  var(--dur-fast) var(--ease-out); }` rule (`css/site.css:307`) already
  uses. Do not introduce a new duration value.
- The existing blanket reduced-motion override at `css/site.css:539-540`
  (`transition-duration: 150ms !important` on `*`) already applies to
  any new `transition` declaration automatically — no separate
  `prefers-reduced-motion` block is needed for this rule.
- `js/site.js` already uses `classList.toggle(name, boolean)` with a
  boolean second argument elsewhere in the same filter block (see
  `chip.setAttribute("aria-pressed", "false")` pattern just above it,
  and `classList.toggle` used at `js/site.js:12` and `js/site.js:67`) —
  match that style.

## Steps

1. In `js/site.js`, locate line 136:
   `c.style.display = okStatus && okColl ? "" : "none";`
   Replace it with:
   `c.classList.toggle("is-filtered-out", !(okStatus && okColl));`
2. In `css/site.css`, locate the end of the `@media (min-width: 64rem) { ... }`
   block that closes at line 317 (the block containing
   `.gallery > *:nth-child(4n+4) { ... }`), and the following line 318
   (`.plisting { display: block; }`). Insert the three new rules from
   Target (the `.plisting[data-status]` rule, the
   `.plisting[data-status].is-filtered-out` rule, and the
   `@starting-style` block) between those two lines, in that order.

## Boundaries

- Do NOT modify `css/site.css:307-308` (the existing `.plisting`
  transition/hover rules) — the new `.plisting[data-status]` rule is
  additive and higher-specificity; it does not need those lines changed.
  (If plan 001 "Gate transform/layout-shifting hover effects" has also
  been applied, line 308 will be wrapped in a media query — that's fine,
  this plan doesn't touch it either way.)
- Do NOT change `js/listings.js` or the markup in `properties.html` —
  `data-status`/`data-collection` attributes stay exactly as they are.
- Do NOT change the filter-matching logic (`okStatus`, `okColl`) — only
  the line that writes the result to the DOM.
- Do NOT add a JS-driven fade (no `animate()`/`Motion` calls) — this is a
  CSS-only entrance/exit, per Target.
- If line 136 of `js/site.js` does not read exactly
  `c.style.display = okStatus && okColl ? "" : "none";`, or the CSS
  block boundaries at `css/site.css:317-318` don't match what's quoted
  above, STOP and report instead of guessing where to splice.

## Verification

- **Mechanical**: none (no build step). Confirm `js/site.js` still
  parses (balanced braces) and `css/site.css` still parses (balanced
  braces, `@starting-style` block properly closed).
- **Feel check**: serve the site locally
  (`python3 -m http.server 8080`), open `properties.html`, and:
  - Click a filter chip (e.g. "Investment") and confirm non-matching
    cards fade out in place rather than disappearing instantly, and the
    grid reflows smoothly as they leave.
  - Click back to "All" and confirm previously-hidden cards fade back in
    (not just snap to visible) — this is the part that depends on
    `@starting-style` support; if it doesn't animate on entry in the
    browser used for testing, note the browser/version in the report
    (as of this writing, `@starting-style` is Chromium 117+, Safari 17.5+;
    Firefox support landed later — an unsupported browser will simply
    show the old instant-swap behavior on entry only, which is an
    acceptable graceful degradation, not a regression).
  - Confirm `.plisting:hover` (the card lift) still works normally on
    cards that remain visible.
  - In DevTools, set the Animations panel playback to 10% and trigger a
    filter change — confirm the fade and the grid reflow happen together
    smoothly, with no flash of the card at full opacity before it starts
    fading out.
  - Toggle `prefers-reduced-motion` (Rendering panel) and confirm the
    filter swap still functions (near-instant per the existing 150ms
    blanket override) without visual glitches.
- **Done when**: filtering the gallery fades cards in/out instead of
  teleporting, hidden cards are fully removed from layout
  (`display: none`) once faded out, and no other filter/listing behavior
  changed.
