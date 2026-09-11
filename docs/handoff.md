# Handoff — AI email automation system (flows, templates, autonomous sending) + SEO pass

Covers the build-out of a GHL-style email automation system for the dashboard — manual/
batch lead entry, AI-drafted one-off emails, a reusable template library, a visual
drag-and-drop nurture-flow builder with branching, and a fully autonomous cron engine
that sends without human review — plus a hardening pass that fixed 10 real bugs in that
engine, and a separate but same-session SEO/structured-data pass. Eight commits on
`main`, in order:

- [`2da687e`](https://github.com/zerotherm27-create/propertiesbychel/commit/2da687e) — manual/batch lead entry, AI-drafted one-off lead emails (Milestone 1)
- [`58a27f3`](https://github.com/zerotherm27-create/propertiesbychel/commit/58a27f3) — email template library + visual, branching flow builder (Milestone 3a/3b; supersedes an earlier linear-sequence design that never shipped)
- [`e185bea`](https://github.com/zerotherm27-create/propertiesbychel/commit/e185bea) — the autonomous flow-sending engine, `api/run-flows.js` (Milestone 3c)
- [`1d8d3f5`](https://github.com/zerotherm27-create/propertiesbychel/commit/1d8d3f5) — AI generation for flows (Quick Generate / Custom AI)
- [`1781bc8`](https://github.com/zerotherm27-create/propertiesbychel/commit/1781bc8) — hierarchical canvas layout + branching in AI-generated flows
- [`a4ecb53`](https://github.com/zerotherm27-create/propertiesbychel/commit/a4ecb53) — fix Compose Email sending raw text as if it were already HTML
- [`123565f`](https://github.com/zerotherm27-create/propertiesbychel/commit/123565f) — dynamic sitemap, per-page meta tags, JSON-LD (separate SEO deliverable, same session)
- [`e14e0b9`](https://github.com/zerotherm27-create/propertiesbychel/commit/e14e0b9) — fix 10 bugs found in a full code-review audit of the automation system

## What was built

**Manual/batch lead entry.** The Leads tab in `dashboard.html` gained a paste-in batch
importer (`js/dashboard.js`: `parseLeadRows`, `splitDelimitedLine`, `LEAD_COLUMN_ALIASES`)
alongside the existing single-lead form.

**Compose Email.** From a lead's detail panel: draft with AI (via the Railway content
agent, `server/lib/leads.js`) or write by hand, review, edit, send via Resend
(`api/send-lead-email.js`). Every send is logged to `lead_email_log` for an audit trail.
This is the only send path with a human in the loop.

**Email template library.** `email_templates` table (category-tagged: general/buyer/
seller/investor/foreign-buyer), a dashboard editor with mail-merge variables
(`{firstName}`, `{intent}`, `{districts}`, `{budgetRange}`, `{timeframe}`, `{status}`,
`{listingTitle}`) and a live preview, plus AI drafting (`server/lib/templates.js`,
`POST /generate-email-template` on the content agent).

**Visual flow builder.** A Drawflow canvas (vendored locally, `js/vendor/drawflow.min.js`
+ `css/vendor/drawflow.min.css`) with four node types — Trigger, Wait (day count from
enrollment), Send Email (picks a template), Condition (checks `leads.status`, two
outputs: Yes/No) — laid out hierarchically (trunk + left/right branches) rather than a
flat horizontal chain. Flows save as Drawflow's own `export()` JSON into
`email_flows.graph`. "AI generation" (Quick Generate / Custom AI) drafts a full flow —
spine + one optional branch point — as new templates and a wired-up graph in one action
(`server/lib/flows.js`).

**The autonomous engine, `api/run-flows.js`.** A Vercel Cron job (`vercel.json`, daily —
the Hobby plan rejects sub-daily schedules at deploy time, not just runtime) that walks
every due `lead_flow_enrollments` row through its flow's graph and sends via Resend with
**no human review** — the one send path with nobody looking at the message first. Uses
`SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS entirely) since there's no logged-in owner
session to authenticate as; that key must only ever live as a Vercel env var, never
client-side or on Railway.

**The bug-fix pass (`e14e0b9`), all found by an 8-angle code-review audit and each
verified against the actual source + a mocked test harness before/after:**
- A failed send's dedup log row was only marked `failed`, never cleared, so a retry's
  insert 409'd against it and was misread as "already sent" — fixed by checking the
  existing row's *status* before deciding duplicate vs. legitimate retry.
- `flow.active` was fetched but never checked — turning a flow off didn't stop leads
  already enrolled from continuing to receive emails. Now skipped (not cancelled) while
  inactive, so it resumes cleanly on reactivation.
- Every permanent failure collapsed into a bare `cancelled` with no reason — now writes
  `cancel_reason` (missing template, opted out, no email, flow/lead deleted, repeated
  send failure), shown in the dashboard's enrollment list.
- Transient send failures retried hourly forever with no cap — now stop and cancel
  (`cancel_reason: send_failed_repeatedly`) after 6 attempts.
- A Wait node's due time is now clamped to `max(enrolled_at + delay_days,
  node_entered_at)`, so a bad or non-ascending `delay_days` (a hand-edit, or an AI branch
  that didn't keep counting from enrollment) can't fire several emails back-to-back in
  one tick.
- Condition values are now filtered against the real `leads.status` enum both server-side
  (AI drafting, `server/lib/flows.js`) and in the dashboard's node config (checkboxes,
  not free text) — a hallucinated/mistyped status used to silently and permanently route
  every lead down the "No" branch.
- The cron's own paragraph renderer didn't convert a lone `\n` to `<br>`, unlike the
  manual-compose renderer — the same template body looked fine in the dashboard preview
  but rendered as one run-on line when actually sent autonomously. Now identical.
- A whitespace-only Compose Email body passed validation and silently sent a blank email
  — now rejected with a 400.
- The flow-voice AI prompt and the Wait-node UI copy both promised `delay_days: 0` sends
  "as soon as enrolled" — false, since the cron only runs once a day. Copy fixed in
  `server/lib/style.js` and `js/dashboard.js` to stop promising immediacy.
- Enrollments were processed one at a time with a fresh flow/lead/template fetch per
  enrollment (N+1). Now batch-fetches flows/leads once per run and caches templates in a
  `Map`, cutting redundant Supabase reads under real load.

**SEO pass (`123565f`), unrelated to the automation system but done the same session:**
dynamic `/sitemap.xml` generated by `middleware.js` from live Supabase data (replacing a
static file); per-page `<title>`/description/canonical/OG/Twitter meta tags and
RealEstateListing/Article JSON-LD patched server-side on first load for listing,
development, and article pages (`middleware.js`'s `servePatchedTemplate`); a client-side
fallback in `js/articles.js` for the same tags. Also closed an XSS gap found in passing —
JSON-LD content wasn't escaping `</script>` sequences before embedding.

## Files touched

- `api/run-flows.js` — new; the autonomous cron engine (Milestone 3c + the bug-fix pass)
- `api/send-lead-email.js` — Compose Email send endpoint; HTML-escaping fix, blank-body
  validation
- `server/lib/flows.js`, `server/lib/templates.js` — new; AI drafting for flows/templates
- `server/lib/style.js` — `EMAIL_TEMPLATE_VOICE`, `FLOW_VOICE` prompt sections
- `server/index.js` — `/generate-flow`, `/generate-email-template` routes
- `js/dashboard.js` (now ~2,130 lines — already over the repo's 500-line guideline before
  this work, grew further; see Known limitations), `dashboard.html` (~930 lines) — Leads
  batch import, Compose Email UI, Templates UI, Flow Builder UI (canvas, node config,
  AI-generate buttons), Active Enrollments list
- `js/vendor/drawflow.min.js`, `css/vendor/drawflow.min.css` — new, vendored
- `supabase/migration-email-templates.sql`, `migration-email-flows.sql`,
  `migration-flow-enrollment-reason.sql` — new; the last one (`cancel_reason`,
  `send_retry_count` on `lead_flow_enrollments`) **must be run manually** in the Supabase
  SQL editor — it wasn't run automatically and the code degrades silently (writes to
  those columns just no-op) until it is
- `vercel.json` — the `run-flows` cron entry
- `middleware.js`, `article.html`, `js/articles.js`, `sitemap.xml` (deleted, now dynamic) —
  the SEO pass

## Known limitations / things to check

- **The autonomous engine has no way to distinguish "genuinely waiting on Day 7" from
  "wedged and retrying uselessly"** for a couple of edge cases the bug-fix pass didn't
  touch: an unrecognized node type, or the 20-hop cycle-detection cap being hit, both
  just retry hourly forever with no terminal state or dashboard signal — unlike the send-
  failure path, which now does cap and surface (see Possible Future Work).
- **No cycle detection at flow-save time.** A miswired Drawflow connection (condition's
  "No" output looped back to an earlier node) is caught at runtime by the 20-hop cap, not
  rejected when the flow is saved. A human building a flow could create this by accident.
- **`escapeHtml`, `extractJson`, and the Resend-send wrapper are each duplicated 2–7
  times** across `api/*.js` and `server/lib/*.js` — flagged by the audit, deliberately
  left as-is (spun off as [a separate suggested cleanup task](../CLAUDE.md), not part of
  this fix pass) since it's a maintenance-risk finding, not a live bug.
- **`js/dashboard.js`/`dashboard.html` exceed the repo's 500-line CLAUDE.md guideline**
  (2,130 / 930 lines) — pre-existing before this work, grew further with the Templates
  and Flow Builder UI added in-place rather than split into their own modules.
- **Condition nodes only ever check `leads.status`** — the `{field, operator, value}`
  shape looks like a general rule engine but every call site (UI, AI prompt, executor)
  hardcodes `field: "status", operator: "in"`. Fine today; don't assume other
  fields/operators work without adding real support for them first.
- **Resend has no open-tracking on the free tier**, so "did the lead engage with this
  email" can't drive a condition — status has to stay a manual dashboard update.
- The Vercel Hobby plan's once-daily cron means Wait-node timing is accurate to within a
  day, not to the hour, regardless of the `delay_days` value entered.

## Not pursued (discussed, deliberately skipped)

- **Retry cap / terminal state for the two edge cases named above** (unrecognized node
  type, hop-cap cycles) — the audit flagged both, but only the send-failure retry cap
  (the one with a real-world trigger — a bad email address or a Resend outage) made the
  fix pass; the other two need a schema-level `stuck`/`needs_review` status, a larger
  change than a quick fix.
- **Deduplicating `escapeHtml`/`extractJson`/the Resend wrapper** — real, flagged, spun
  off as its own suggested task rather than bundled into the bug-fix commit.
- **Sub-daily cron scheduling** — technically wanted (so `delay_days: 0` really would
  read as "immediate"), blocked by the Vercel Hobby plan; worked around with a copy fix
  instead of a scheduling workaround.

## Possible future work

- Add a `stuck`/`needs_review` enrollment status for the unrecognized-node-type and
  hop-cap-cycle cases, surfaced in the dashboard the same way `cancel_reason` now is.
- Cycle-detect a flow's graph at save time in `js/dashboard.js`, before it ever reaches
  the cron engine.
- Factor `escapeHtml`, `extractJson`, and the Resend POST wrapper into shared modules
  (`api/_lib/`, `server/lib/ai.js`) — see the spun-off cleanup task.
- Split `js/dashboard.js` into per-feature modules (Leads, Templates, Flow Builder) now
  that it's grown well past the file-size guideline.
- If Resend's paid tier or a future plan adds open-tracking, extend Condition nodes to
  check engagement, not just pipeline status.
- Upgrade off the Vercel Hobby plan if true sub-daily (or hourly) flow timing becomes a
  real product requirement.
