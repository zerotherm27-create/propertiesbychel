# 001 — Gate transform/layout-shifting hover effects behind (hover: hover) and (pointer: fine)

- **Status**: DONE
- **Commit**: 7e5023c
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (css/site.css), 6 edits

## Problem

`css/site.css` has ~30 `:hover` rules and none of them are gated behind a
hover-capability media query. On touch devices, tapping an element can
trigger a "sticky hover" state that persists until the user taps elsewhere
(iOS Safari and many Android browsers simulate `:hover` on tap). Most of
this site's `:hover` rules only change color/text-decoration, which is
harmless if it sticks. But 8 of them animate `transform` or shift layout
via `padding`/`margin`, and those are the ones that read as visibly
"stuck" or broken on a touch device — a property card that stays lifted,
a nav underline that stays extended, a photo that stays zoomed, after the
finger has already lifted. On a real-estate site, property cards
(`.plisting`) and district/journal rows (`.index-row`) are the primary
browsing surface, and a large fraction of that traffic is mobile.

The 8 rules to gate, with current code:

```css
/* css/site.css:104 — current */
.link-line:hover .arr { transform: translateX(4px); }
```

```css
/* css/site.css:134 — current */
.masthead__nav a:not(.masthead__cta):hover::after { transform: scaleX(1); }
```

```css
/* css/site.css:179 — current */
html:not(.has-frame-tilt) .frame--hover:hover img, html:not(.has-frame-tilt) a:hover .frame--hover img { transform: scale(1.045); }
```

```css
/* css/site.css:295-296 — current */
a.index-row:hover { background-color: color-mix(in oklch, var(--ink) 4%, transparent); padding-inline: var(--space-4); }
a.index-row:hover .index-row__no { transform: translateX(2px); }
```

```css
/* css/site.css:308 — current */
.plisting:hover { transform: translateY(-6px); }
```

```css
/* css/site.css:387,392 — current */
.funnel-choice:hover { background: color-mix(in oklch, var(--ink) 4%, transparent); padding-inline: var(--space-4); }
.funnel-choice:hover .funnel-choice__arr { transform: translateX(4px); color: var(--brass-deep); }
```

**Do not touch** any other `:hover` rule in the file — rules that only
change `color`, `background-color` (without `padding`), `border-color`,
`text-decoration`, `filter`, `opacity`, or `font-style` are harmless if
they stick on touch and are explicitly out of scope for this plan (e.g.
`.btn:hover`, `.chip:hover`, `.footer ul a:hover`, `.kanban-card:hover`,
`.dash-table tbody tr:hover`, `.partners-marquee:hover .partners-track`,
`a.index-row:hover .index-row__title`, `.plisting:hover .plisting__title`).

## Target

Each of the 6 locations above wrapped in
`@media (hover: hover) and (pointer: fine) { ... }`, in place (do not
relocate the rules elsewhere in the file — wrap them where they stand so
the diff stays easy to review). Where two rules are already adjacent and
share the same trigger, wrap them together in one media block rather than
opening the query twice.

```css
/* css/site.css:104 — target */
@media (hover: hover) and (pointer: fine) {
  .link-line:hover .arr { transform: translateX(4px); }
}
```

```css
/* css/site.css:134 — target */
@media (hover: hover) and (pointer: fine) {
  .masthead__nav a:not(.masthead__cta):hover::after { transform: scaleX(1); }
}
```

```css
/* css/site.css:179 — target */
@media (hover: hover) and (pointer: fine) {
  html:not(.has-frame-tilt) .frame--hover:hover img, html:not(.has-frame-tilt) a:hover .frame--hover img { transform: scale(1.045); }
}
```

```css
/* css/site.css:295-296 — target */
@media (hover: hover) and (pointer: fine) {
  a.index-row:hover { background-color: color-mix(in oklch, var(--ink) 4%, transparent); padding-inline: var(--space-4); }
  a.index-row:hover .index-row__no { transform: translateX(2px); }
}
```

```css
/* css/site.css:308 — target */
@media (hover: hover) and (pointer: fine) {
  .plisting:hover { transform: translateY(-6px); }
}
```

```css
/* css/site.css:387,392 — target */
@media (hover: hover) and (pointer: fine) {
  .funnel-choice:hover { background: color-mix(in oklch, var(--ink) 4%, transparent); padding-inline: var(--space-4); }
  .funnel-choice:hover .funnel-choice__arr { transform: translateX(4px); color: var(--brass-deep); }
}
```

## Repo conventions to follow

- The exact media query string `(hover: hover) and (pointer: fine)` is
  already used in this codebase for the same purpose — see
  `js/motion-enhance.js:51`, which gates the JS-driven property-card tilt
  behind the identical check. Match that string verbatim in CSS.
- Do not introduce a new custom property or SCSS-like nesting — this file
  uses flat CSS with `@media` blocks exactly as seen at
  `css/site.css:230` and `css/site.css:539` (existing
  `prefers-reduced-motion` blocks use the same wrapping style: one
  `@media` block containing one or more full rules, indented two spaces).

## Steps

1. In `css/site.css`, locate line 104 (`.link-line .arr { ... }`,
   specifically the `.link-line:hover .arr` rule) and wrap it in a new
   `@media (hover: hover) and (pointer: fine) { }` block as shown in
   Target above. Leave every other rule in that section (`.link-line`,
   `.link-line:hover`, `.link-line--brass`, etc.) untouched.
2. Locate line 134 (`.masthead__nav a:not(.masthead__cta):hover::after`)
   and wrap only that rule. Line 136
   (`.masthead__nav a:not(.masthead__cta):hover, ... { color: currentColor; }`)
   stays outside the media query, unchanged.
3. Locate line 179 (the `.frame--hover:hover img` / `a:hover .frame--hover img`
   rule) and wrap it.
4. Locate lines 295-296 (`a.index-row:hover { ... }` and
   `a.index-row:hover .index-row__no { ... }`) and wrap both together in
   one media block. Line 294
   (`a.index-row:hover .index-row__title { font-style: italic; }`) stays
   outside, unchanged.
5. Locate line 308 (`.plisting:hover { transform: translateY(-6px); }`)
   and wrap it. Line 321
   (`.plisting:hover .plisting__title { font-style: italic; }`) stays
   outside, unchanged.
6. Locate lines 387 and 392 (the two `.funnel-choice:hover` rules) and
   wrap both together in one media block.

## Boundaries

- Do NOT touch any `:hover` rule not explicitly listed above.
- Do NOT touch `js/motion-enhance.js` or any other JS file — this plan is
  CSS-only.
- Do NOT change selectors, property values, or durations — only add the
  `@media` wrapper around the exact existing declarations.
- Do NOT add a new media query per rule if two target rules are already
  adjacent (295-296, 387+392) — combine those into one block each, per
  Target.
- If any of the 6 line numbers has drifted (the rule's contents don't
  match what's quoted in Problem/Target), STOP and report instead of
  guessing which rule was intended.

## Verification

- **Mechanical**: none (no build step) — open each edited section in the
  file afterward and confirm the CSS still parses as valid (balanced
  braces, no stray `@media` left unclosed). If a linter is available,
  run it; otherwise visually diff each hunk against the Target blocks
  above.
- **Feel check**: serve the site locally (`python3 -m http.server 8080`
  from the repo root) and in a real browser:
  - Resize the viewport to mobile width (or use device emulation) and
    confirm tapping a property card (`.plisting`) on `properties.html`
    no longer leaves it visually lifted after the tap ends.
  - At desktop width with a mouse, confirm `.plisting:hover` still lifts
    the card exactly as before (the media query should still match on a
    real mouse+trackpad).
  - Confirm the masthead nav underline, index-row hover, funnel-choice
    hover, and frame zoom all still work with a mouse and are inert on
    touch/emulated-touch.
  - Toggle `prefers-reduced-motion` (DevTools Rendering panel) and
    confirm no regression — these rules were already covered by the
    blanket reduced-motion override at `css/site.css:539-540`, which is
    unaffected by this change.
- **Done when**: all 6 locations are wrapped exactly as specified, no
  other `:hover` rule in the file was modified, and mouse-hover behavior
  on desktop is visually unchanged from before this plan.
