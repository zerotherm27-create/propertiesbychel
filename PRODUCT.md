# Product

## Register

brand

## Platform

web

## Users

High-net-worth local and foreign buyers and sellers of significant residences in the Philippines' prime markets (Makati, BGC, Boracay, Forbes Park, Alabang, and similar districts). They want discretion and personal judgement, not a volume listings-browsing experience — a dedicated foreign-buyers page addresses cross-border concerns specifically, and a sellers page speaks to owners seeking discreet representation on the other side of the table.

## Product Purpose

An independent, boutique real estate advisory practice — not a listings aggregator — that curates and personally advises on the acquisition and sale of significant residences in the Philippines' prime markets. Success is a qualified private-presentation request from a serious buyer or seller who values discretion and close market knowledge over browsing volume.

## Positioning

An independent practice, not a listings aggregator: representing a small number of clients at a time, on both sides of the table, with no volume targets and no paid placements — only properties worth attention, and advice worth acting on.

## Conversion & proof

- **Primary CTA**: Request a Private Presentation (`presentation.html`, its own multi-step funnel; also the persistent masthead CTA)
- **Secondary CTA**: Browse the Collection (`properties.html`) — the lower-commitment fallback for visitors not ready to request a presentation
- **The line a visitor remembers after 10 seconds**: "Prime Philippine property, quietly advised." (the actual hero headline)
- **Belief ladder**: (1) this practice has close, specific knowledge of the district in question, not generic market coverage; (2) representation here means personal judgement and discretion, not a sales funnel; (3) the curated collection reflects genuine selectivity, not everything currently on the market; (4) a private presentation is worth the small friction of asking, because it starts a real conversation, not a mailing list.
- **Proof on hand**: partner/accreditation logos, already surfaced via the `.partners-marquee` component (`css/site.css:429-449`). No client testimonials or press coverage yet — a real gap worth closing before leaning harder on social proof anywhere in the site.

## Brand Personality

Quiet, discreet, considered. The copy voice is understated and editorial — confident without being salesy ("quietly advised," "Begin Quietly," "worth your attention and advice worth acting on"). Never loud, never volume-oriented, never mass-market. The existing navy/gold/warm-off-white palette and squared, plate-like frames (zero border-radius) already carry this restraint visually; new work should extend it, not soften it toward generic warmth.

## Anti-references

Generic listings aggregators (Zillow/Lamudi-style grid-of-cards, badge-and-filter-heavy browsing UX) — the opposite of a curated, editorial approach. Loud or flashy luxury real-estate templates (gold-heavy surfaces, gradient-drenched sections, autoplay hero video on every scroll) — restraint is the luxury signal here, not ornamentation.

## Design Principles

Curation over volume — every surface should read as selective, not exhaustive, echoing the copy's own "no volume targets." Discretion over spectacle — restraint is the luxury signal, not decoration. Editorial before transactional — pages (journal, intelligence notes, district guides) earn trust as a considered publication before they ask for anything. Close knowledge over generic coverage — district-specific detail is the credibility mechanism, not stock luxury-real-estate copy. Motion should feel deliberate, never gratuitous — matches the considered, purpose-first animation language already built into the site.

## Accessibility & Inclusion

WCAG 2.1 AA baseline. No additional known user needs beyond that. The codebase already implements broad `prefers-reduced-motion` support and touch-safe `(hover: hover) and (pointer: fine)` gating on transform-driven hover effects — new work should preserve both patterns.
