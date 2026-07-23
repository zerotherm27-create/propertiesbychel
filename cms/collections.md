# CMS Collections — Properties by Chel

> **Status (2026-07-22):** partially implemented on Supabase. `listings`, `leads`
> (enquiries + CRM fields), and `site_settings` now exist as real tables — see
> [`supabase/schema.sql`](../supabase/schema.sql) and the owner dashboard at
> `dashboard.html`. The remaining collections below (districts, insights,
> journal, reports) are still design specs for a future phase.

Structured content models for wiring this site to any headless CMS (Sanity, Contentful, Payload, Directus) or a Supabase schema. Field types use a neutral vocabulary: `string`, `text` (rich), `number`, `boolean`, `date`, `image`, `file`, `select`, `ref`, `ref[]`.

## properties
| Field | Type | Notes |
|---|---|---|
| title | string | e.g. "The Zenith Penthouse" |
| slug | string | unique, URL |
| status | select | `for-sale` · `for-lease` · `investment` · `reserved` · `sold` (sold hidden by default) |
| collections | ref[] → property_categories | skyline, estate, branded, legacy, investment-grade |
| district | ref → districts | |
| price_amount | number | PHP; omit to show "Price on application" |
| price_display | string | optional override, e.g. "₱380K / mo", "From ₱65M" |
| headline_position | string | short locator shown publicly, e.g. "High Street South corridor" |
| address_private | string | full address — never rendered publicly |
| interior_sqm / lot_sqm | number | |
| bedrooms / baths / parking | number | |
| tenure | select | CCT · TCT · leasehold · pre-selling |
| overview | text | narrative, 2–4 paragraphs |
| specs | array of {label, value} | rendered as the hairline spec table |
| amenities | string[] | |
| gallery | image[] with alt + caption + crop hint (`wide`/`tall`/`square`) | drives editorial sequencing |
| floorplan_image | image | optional; falls back to schematic |
| floorplans_file | file | measured plans PDF (gated: sent on request) |
| location_notes | text + array of {label, value} | |
| map | geo or image | precise pin gated to confirmed viewings |
| disclosure | array of {label, value} | title refs, project licence no., dues — "furnished on request" allowed |
| featured | boolean | home spotlight |
| published | boolean | off-market listings stay unpublished but shareable via private link |

## districts
| Field | Type | Notes |
|---|---|---|
| name / slug | string | |
| region_label | string | "01 — Metro Manila" |
| teaser | text | one-paragraph index entry |
| atmosphere_essay | text | long-form |
| stock_notes | array of {type, note} | "what trades here" table |
| market_reading | text | |
| addresses_of_note | array of {key, title, meta} | |
| hero_image / index_image | image | |
| chart | ref → charts (optional) | |
| order | number | index sequence |

## market_insights
| Field | Type | Notes |
|---|---|---|
| title / slug | string | |
| kind | select | `note` · `snapshot` · `briefing` · `quarterly` |
| district | ref → districts (optional) | |
| dek | string | one-line summary for index rows |
| body | text | |
| chart_data | json | {labels[], series[{name, points[]}], caption, illustrative:boolean} — renders to the hairline SVG style |
| pdf | ref → reports (optional) | |
| publish_date | date | |
| client_only | boolean | gates full text behind request |

## property_categories
`name`, `slug`, `description`, `order` — the five launch categories: Skyline Residences, Estate Lots & Villas, Branded Residences, Legacy Family Homes, Investment-Grade Units.

## partners (developer accreditations)
| Field | Type | Notes |
|---|---|---|
| name | string | e.g. "Ayala Land" |
| logo | image | SVG/PNG/JPG wordmark, stored in `images/partners/`; rendered in the homepage's auto-sliding `.partners-marquee` strip |
| url | string (optional) | developer's site, if linking out is wanted |
| active | boolean | show/hide without deleting |
| order | number | index sequence |

Powers the "Accredited Broker" strip on the homepage (`index.html`) and the Developer Accreditation row on `about.html`. Current entries (11): Ayala Land, Alveo, Avida, DMCI Homes, Filinvest, Megaworld, Rockwell Land, Shang Properties, Federal Land, FNG (Federal Land & Nomura Real Estate), Keen & Worth Property Developers (Ongpin Tower). Logos live in `images/partners/`; sourced from official developer sites and Wikimedia Commons where the developer's own site blocked automated fetching (Avida, Federal Land) — swap for higher-resolution official files if the client supplies them directly. Add rows here as new accreditations are confirmed.

## journal_entries
| Field | Type | Notes |
|---|---|---|
| title / slug | string | |
| kind | select | `essay` · `neighbourhood-study` · `briefing` · `property-story` |
| dek | string | |
| lead_image | image + caption | |
| body | rich text | supports pull quotes, captioned figures, h2 sections |
| companion_report | ref → reports (optional) | "companion briefing" module |
| related | ref[] → journal_entries | further reading |
| publish_date | date | |

## reports (downloadable briefings)
| Field | Type | Notes |
|---|---|---|
| title / slug | string | |
| code | string | display index, e.g. "B·01" |
| summary | text | |
| file | file | PDF |
| access | select | `open` · `on-request` · `clients-only` (site currently uses on-request → routes to presentation form) |

## legal_disclosures
Singleton-ish collection powering footer + legal page + engagement boilerplate:
`practice_name`, `office_locality`, `prc_license_display` (string — supports "furnished on enquiry" until the client supplies the number), `registrations` (array of {label, value, public:boolean}), `privacy_notice` (text), `terms` (text), `disclaimer_property` (text appended to listings).

## enquiries (form submissions)
`name`, `email`, `phone?`, `intent`, `districts?`, `range?`, `timeframe?`, `notes?`, `source_page`, `created_at`, `handled` (boolean). Both forms (`presentation.html`, `contact.html`) post here — wire `form[data-enquiry]` in `js/site.js` to your endpoint.

### Editorial rules encoded in the models
- Public pages never render `address_private`, precise pins, or client names.
- Any chart rendered from `chart_data` with `illustrative:true` must carry the "illustrative presentation" caption.
- No fields exist for awards, testimonials, or sales-volume claims — by design.
