---
name: Properties by Chel
description: An independent Philippine real estate advisory — quiet, discreet, and editorial rather than a listings aggregator.
colors:
  ink-navy: "oklch(30.0% 0.089 262.9)"
  ink-soft: "oklch(44% 0.008 260)"
  ink-faint: "oklch(58% 0.006 260)"
  deep-espresso-navy: "oklch(23.4% 0.061 259.7)"
  espresso-deep: "oklch(26% 0.075 261)"
  on-espresso: "oklch(94% 0.008 85)"
  on-espresso-soft: "oklch(78% 0.010 85)"
  antique-brass: "oklch(76.7% 0.139 91.9)"
  brass-deep: "oklch(52% 0.135 88)"
  warm-paper: "oklch(97.5% 0.006 85)"
  parchment-panel: "oklch(95.5% 0.010 85)"
  stone: "oklch(90% 0.010 80)"
  focus-ring: "oklch(50% 0.10 250)"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(2.75rem, 7vw, 5.5rem)"
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(2.5rem, 5vw, 4.25rem)"
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(1.375rem, 2vw, 1.75rem)"
    fontWeight: 500
    lineHeight: 1.12
  body:
    fontFamily: "Work Sans, Helvetica Neue, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  lede:
    fontFamily: "Work Sans, Helvetica Neue, sans-serif"
    fontSize: "clamp(1.125rem, 1.4vw, 1.3125rem)"
    fontWeight: 300
    lineHeight: 1.7
  label:
    fontFamily: "Work Sans, Helvetica Neue, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.22em"
rounded:
  none: "0px"
spacing:
  space-2: "0.5rem"
  space-4: "1rem"
  space-6: "1.5rem"
  space-8: "2rem"
  space-12: "3rem"
  space-16: "4rem"
  margin: "clamp(1.25rem, 5.5vw, 5rem)"
  section: "clamp(5.5rem, 11vw, 10rem)"
components:
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.none}"
    padding: "1.05rem 2.5rem"
  button-outline-hover:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.warm-paper}"
    rounded: "{rounded.none}"
  button-primary:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.warm-paper}"
    rounded: "{rounded.none}"
    padding: "1.05rem 2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.espresso-deep}"
    textColor: "{colors.on-espresso}"
    rounded: "{rounded.none}"
---

# Design System: Properties by Chel

## 1. Overview

**Creative North Star: "The Private Viewing"**

Properties by Chel presents itself as a by-invitation gallery, not a search engine. Every surface behaves like a curator walking one visitor through a small, deliberately chosen collection: a frame instead of a card, a corner bracket instead of a shadow, a single presentation request instead of a lead-gen popup. The design's job is to make restraint itself feel expensive — a warm paper ground, ink-navy text, and one gold accent used sparingly enough that its rarity is the point.

The system explicitly rejects the two failure modes a luxury real-estate brand usually falls into: the listings-aggregator look (dense card grids, filter chips everywhere, badge-heavy browsing) and the loud-luxury look (gold-drenched surfaces, autoplay hero video, gradient sheen). Neither appears here. Corners are square. Shadows don't exist. Gold is a hairline, not a fill.

**Key Characteristics:**
- Flat, plate-like surfaces — zero border-radius anywhere, depth from hairlines and tone, never shadow
- One accent color (antique brass) used at hairline scale: dividers, corner brackets, small labels — never as a fill
- Serif display type (Playfair Display) paired with a clean sans body (Work Sans) — an editorial, magazine-like voice
- Motion is quiet and physically plausible: short, GPU-only, gated off on touch so nothing "sticks"

## 2. Colors

A warm, restrained palette: navy ink on warm paper, with antique brass as the only accent, used at low coverage.

### Primary
- **Ink Navy** (`oklch(30.0% 0.089 262.9)` / `#142B5A`): the primary text and heading color on light surfaces — carries nearly all body copy and every serif headline.

### Secondary
- **Antique Brass** (`oklch(76.7% 0.139 91.9)` / `#D4AF37`): the single accent. Used at hairline scale only — eyebrow rule marks, frame corner brackets, dividers, marquee highlights. Never a fill, never more than a sliver of any given screen.
- **Brass Deep** (`oklch(52% 0.135 88)` / darkened gold): the same accent lifted to text-legible contrast, for the rare moments the accent needs to carry a word or two (labels, prices, the article drop-cap) directly on warm paper.

### Tertiary
- **Deep Espresso Navy** (`oklch(23.4% 0.061 259.7)` / `#0B1D3A`): the dark-section ground — the full-screen menu overlay, dark editorial bands, the cinematic hero's base. Paired with `On-Espresso` (`oklch(94% 0.008 85)`) and `On-Espresso Soft` (`oklch(78% 0.010 85)`) for text on those sections.

### Neutral
- **Warm Paper** (`oklch(97.5% 0.006 85)`): the primary page ground.
- **Parchment Panel** (`oklch(95.5% 0.010 85)`): subtly recessed panels and secondary surfaces (dashboard body, secondary bands) — one step darker than Warm Paper, never a hard border between them.
- **Stone** (`oklch(90% 0.010 80)`): divider ground and image placeholder fill.
- **Ink Soft** (`oklch(44% 0.008 260)`) / **Ink Faint** (`oklch(58% 0.006 260)`): secondary text and caption/meta text respectively — both charcoal-toned, never pure gray.
- **Focus Ring** (`oklch(50% 0.10 250)`): the only color reserved exclusively for `:focus-visible` — never reused decoratively.

### Named Rules
**The Hairline Rule.** Brass never fills a surface. It appears as a 1px rule, a corner bracket, a marquee accent, or legible text — coverage stays low enough that its rarity reads as restraint, not decoration.

**The No-Gray Rule.** Secondary and caption text (`Ink Soft`, `Ink Faint`) are tinted charcoal derived from the ink-navy hue, never a flat neutral gray — text always feels like it belongs to the same ink family as the headlines.

## 3. Typography

**Display Font:** Playfair Display (with Georgia, serif fallback)
**Body Font:** Work Sans (with Helvetica Neue, sans-serif fallback)
**Label/Mono Font:** a system monospace stack, reserved for the dashboard's numeric data only — never appears on the public marketing surfaces.

**Character:** A classic editorial pairing — a high-contrast serif for anything the visitor is meant to read as a headline or a name (property titles, section heads, the drop-cap on journal articles), set against a quiet, low-contrast grotesque for everything functional (body copy, labels, navigation, buttons).

### Hierarchy
- **Display** (weight 500, `clamp(2.75rem, 7vw, 5.5rem)`, line-height 1.12): the hero headline only — one per page, at most.
- **Headline** (weight 500, `clamp(2.5rem, 5vw, 4.25rem)`, line-height 1.12): page `<h1>`s on interior pages.
- **Title** (weight 500, `clamp(1.375rem, 2vw, 1.75rem)` up to `clamp(1.875rem, 3.2vw, 2.75rem)` for section heads): section headers, property card titles, index-row titles.
- **Body** (weight 400, 1rem, line-height 1.75): running copy. **Lede** (weight 300, `clamp(1.125rem, 1.4vw, 1.3125rem)`, line-height 1.7) is the larger, lighter intro paragraph that opens most sections. Prose is capped at the `--measure` token (38rem / ~65ch).
- **Label** (weight 600, 0.6875rem, letter-spacing 0.22em, uppercase): nav links, form labels, eyebrows, buttons, meta rows. The single most-reused voice in the system after body copy.

### Named Rules
**The One Serif Rule.** Playfair Display appears only where something is being *named* — a headline, a property title, a person's name, a pull-quote. Everything functional (labels, nav, buttons, meta) stays in Work Sans. Mixing the two inside a single line of text never happens.

**The Balanced Heading Rule.** Every `h1`–`h3` uses `text-wrap: balance`; the display headline ceiling stays at `5.5rem` and letter-spacing never tightens past `-0.015em` — cramped, shouting type is treated as a defect, not intensity.

## 4. Elevation

The system is flat by deliberate choice: zero `box-shadow` anywhere in the codebase. Depth is conveyed entirely by hairline borders (`--rule: 1px`), background tone shifts (paper → parchment-panel → stone), and one true exception — the fixed masthead's `backdrop-filter: blur(10px)` over a translucent paper tint, which reads as a pane of glass rather than a floating card.

### Named Rules
**The Flat-By-Default Rule.** Nothing lifts on a shadow. A property card's hover state moves the element itself (`translateY(-6px)`) against a flat ground; it never gains a shadow to fake depth. If something needs to feel "above" the page, blur or a tonal shift does that work, not `box-shadow`.

## 5. Components

Every component is restrained and precise: square corners, hairline borders, deliberate but understated state changes. Nothing is decorative for its own sake.

### Buttons
- **Shape:** square corners throughout (`border-radius: 0`), 1px border (`--line-strong`), generous padding (`1.05rem 2.5rem`).
- **Primary / Solid** (`.btn--solid`): ink-navy fill, warm-paper text; hovers to `Espresso Deep`.
- **Outline** (`.btn`, the default): transparent fill, ink-navy border and text; hovers by inverting to a solid ink-navy fill.
- **On dark** (`.btn--on-dark`): for use on espresso-toned sections — inverts the same logic against the dark ground.
- **Hover / Focus:** color/background/border transition at 200ms (`--dur-fast`) with a strong ease-out curve; a `:focus-visible` outline in `Focus Ring`, offset 3px. Press feedback is a JS-driven spring (a slight lift and scale), gated so it never fires on already-inert/loading buttons.

### Links (`.link-line`)
- **Style:** no button chrome — an underline (1px, `--line`) beneath uppercase label text, with a small trailing arrow glyph.
- **State:** on hover, the underline darkens to ink-navy and the arrow slides 4px right — a considered, understated affordance rather than a filled button.

### Cards / Frames
- **Property card** (`.plisting`): no card chrome at rest — no border, no background, no shadow. On hover it lifts 6px via `transform`, gated behind `(hover: hover) and (pointer: fine)` so it never sticks on tap.
- **Photo frame** (`.frame`, `.frame--corners`): square-cornered image container; the signature corner-bracket motif (`.frame--corners`) draws two opposing 1px brass hairline brackets over the top-left and bottom-right corners — the closest thing this system has to ornament, used sparingly.
- **Corner Style:** always `0` radius — no exceptions found anywhere in the codebase.
- **Shadow Strategy:** none; see Elevation.

### Inputs / Fields (`.field`)
- **Style:** underline-only — no box, no background, a 1px bottom border (`--line-strong`), italic placeholder text.
- **Focus:** border darkens to `Brass Deep`; `:focus-visible` adds the standard 2px `Focus Ring` outline.
- **Error:** border shifts to `Brass Deep` with an inline error message below, in `Ink Faint` at `--text-sm`.

### Navigation (`.masthead`)
- **Style:** fixed, translucent paper ground with a blur, 1px bottom hairline that only appears once scrolled. Logo scales down (via `transform: scale()`, not a `height` change) on scroll.
- **States:** nav links use an animated underline (`scaleX` from `transform-origin: left`) on hover, gated to hover-capable pointers.
- **Mobile:** collapses to a hamburger toggle opening a full-screen `Deep Espresso Navy` overlay with large serif links, staggered in on open.

### Index Rows (`.index-row`) — signature list component
Used for district guides and the journal index: a three-column grid (number · title · meta) separated by hairlines, no card chrome. Hover tints the background faintly and nudges the row number 2px right — a quiet, editorial-table feel rather than a clickable card grid.

## 6. Do's and Don'ts

### Do:
- **Do** keep every corner square — `border-radius: 0` is a hard constant across buttons, frames, fields, and panels.
- **Do** treat antique brass as a hairline accent only — corner brackets, dividers, small labels, legible text at the `Brass Deep` shade. Never a background fill.
- **Do** convey depth with hairline borders and tonal shifts (paper → parchment-panel → stone), never `box-shadow`.
- **Do** gate every transform-driven `:hover` effect behind `(hover: hover) and (pointer: fine)` so nothing sticks on tap.
- **Do** keep motion under 300ms for anything hover/click-triggered (`--dur-fast`, 200ms is the default); reserve `--dur-slow` (1100ms) for marketing-only entrance moments, never for repeated UI feedback.
- **Do** cap prose at the `--measure` token (~65ch) and use `text-wrap: balance` on headings.

### Don't:
- **Don't** build a dense, filter-heavy listings-aggregator grid (Zillow/Lamudi-style) — the collection is presented as a curated set, not a searchable database.
- **Don't** drench the interface in gold, add gradients, or autoplay hero video on every scroll — restraint is the luxury signal here, not ornamentation.
- **Don't** add a shadow to fake elevation on hover or focus — move the element itself, or use the blur/tonal-shift vocabulary instead.
- **Don't** use `border-left`/`border-right` colored stripes as an accent on any card, row, or callout.
- **Don't** clip gradient text (`background-clip: text` + gradient) for emphasis — weight or size only.
- **Don't** mix Playfair Display into functional UI text (labels, nav, buttons) — it's reserved for headlines, names, and titles only.
