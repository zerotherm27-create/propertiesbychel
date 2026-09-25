# Handoff — headless email Inbox & Outbox (Resend), installation + organizing

This is a standalone copy of the Inbox/Outbox handoff for reference. Per this repo's convention,
`docs/handoff.md` always documents the *most recent* work (currently the first-party site
analytics), so the Inbox writeup no longer lives there. This file merges the original
installation handoff (retrievable at `git show d311322:docs/handoff.md`) with the "Organize the
Inbox" work that shipped later in the same 2026-09-24 session, so the whole feature is described
in one place.

A mailbox inside the owner dashboard: receive email, send one-off email (formatted text or
HTML, with a saved signature), see delivery status, reply in-thread, and organize messages into
folders. No external email UI — Resend is the transport, Supabase is the store, `dashboard.html`
is the interface.

Commits (all 2026-09-24 unless noted):

- [`aa21204`](https://github.com/zerotherm27-create/propertiesbychel/commit/aa21204) — schema, webhook, send endpoint, Inbox tab, middleware fix
- [`709be23`](https://github.com/zerotherm27-create/propertiesbychel/commit/709be23) — plain-text alternative on every send; optional `RESEND_REPLY_TO`
- [`52ffbeb`](https://github.com/zerotherm27-create/propertiesbychel/commit/52ffbeb) — HTML compose mode with template + AI generators
- [`1efe866`](https://github.com/zerotherm27-create/propertiesbychel/commit/1efe866) — formatting toolbar for plain-text compose, and the saved email signature
- [`d311322`](https://github.com/zerotherm27-create/propertiesbychel/commit/d311322) — HTML compose shown as a preview; branded, email-safe generated layout
- [`d6fa8dc`](https://github.com/zerotherm27-create/propertiesbychel/commit/d6fa8dc) — Organize the Inbox: folders, star, archive, search, delete to Trash

The previous handoff before this feature (the flows/templates/autonomous-sending system and its
10-bug audit pass) is at
[`a6fc425`](https://github.com/zerotherm27-create/propertiesbychel/commit/a6fc425)
(`git show a6fc425:docs/handoff.md`).

## How it works

- **Store:** `public.email_messages` (`supabase/migration-email-messages.sql`) — one row per
  email, `direction` INBOUND/OUTBOUND, `status` SENT/DELIVERED/BOUNCED/RECEIVED/FAILED,
  `resend_id` (unique, so webhook retries upsert instead of duplicating), `message_id` and
  `in_reply_to` for threading, nullable `lead_id`. Owner-only RLS (`is_owner()`).
  Deliberately separate from `lead_email_log`, which stays the lead-scoped audit log for
  flow/one-off lead sends.
  `supabase/migration-email-organize.sql` (**run by hand**, after `migration-email-messages.sql`)
  adds `is_read`, `is_starred`, `is_archived`, `deleted_at`; the existing owner-only RLS already
  covers them, so the dashboard updates rows directly with supabase-js.
- **Inbound — `api/webhooks/resend.js`:** verifies the Svix signature on the raw body
  (`resend.webhooks.verify`), then on `email.received` fetches the full body with
  `resend.emails.receiving.get` (the webhook payload omits it), links a lead by sender
  address if one matches, and upserts an INBOUND row. Also handles `email.sent` (backfills
  the outbound Message-ID, which Resend only reveals here), `email.delivered`,
  `email.bounced`, `email.failed` (status updates that never downgrade a later state).
  Writes with `SUPABASE_SERVICE_ROLE_KEY` — no user session on a webhook.
- **Outbound — `api/dashboard/email/send.js`:** owner-only (`api/_lib/owner-auth.js`, the
  same check as `send-lead-email.js`). Takes `{ to, subject, htmlBody, textBody?,
  parentMessageId? }`, validates (single-line subject, single recipient, header-safe
  Message-ID), sends via the Resend SDK, then logs with the caller's own token so RLS
  applies. Always sends a plain-text part (derived from the HTML if none given). Sets
  `In-Reply-To`/`References` from `parentMessageId`, and `Reply-To` from `RESEND_REPLY_TO`
  when set. If logging fails after a successful send it returns success plus a warning
  rather than an error the owner might retry into a duplicate.
- **Dashboard — Inbox tab** (`dashboard.html`, `js/dashboard.js`): list with folders (Inbox =
  inbound, not archived · Sent · Starred · Archive · Trash · All mail), a detail pane, compose
  panel, and Reply (prefills To/Re:/parent). Search runs over sender/recipient/subject. Unread
  counts show as a folder chip and a nav badge; opening a message marks it read. Star, archive,
  mark read/unread, and bulk select are all supported. **Delete moves to Trash (`deleted_at`),
  which is restorable; only "Delete forever" / "Empty trash" removes rows**, behind a confirm.
  Without the organize migration the Inbox still works (it retries with the basic columns and
  shows a note).
  Compose has a Plain text / HTML toggle. **Plain text mode** has a formatting toolbar
  (bold, italic, link, heading, bulleted/numbered list; Ctrl/Cmd+B/I/K) that writes light
  markup (`**bold**`, `*italic*`, `[text](url)`, `- ` / `1. ` lists, `# ` heading) converted to
  HTML on send by `plainTextToHtml` — everything is HTML-escaped first and only
  `http(s):`/`mailto:` links are allowed, so typed text can't inject markup — with a live
  preview. **Signature:** one saved block (`site_settings` key `email_signature`, so no
  migration; that table is public-read/owner-write, fine because a signature goes out in
  every email anyway), same markup, "Include signature" checkbox per message, appended in
  both modes (inside `</body>` when the HTML has one) and shown in the preview. HTML mode: pick
  a saved template or "Draft with AI" (existing `/generate-email-template` endpoint on the
  Railway agent). The **preview is the main view**; the code sits behind an "Edit HTML code"
  toggle. Generated emails use a branded, email-safe shell (`renderTemplateHtml` in
  `js/dashboard.js`): table layout, inline styles, web-safe fonts, site palette from
  `DESIGN.md` (ink-navy type and button, warm-paper card on parchment, one short brass rule,
  square corners), logo from `https://www.propertiesbychel.com/images/logo-navy.png`, tagline
  footer. It leaves a `<!--signature-->` marker so the signature lands inside the card. Merge
  fields fill from the lead whose email matches the To address (else `firstName` → "there").
  **Flow emails sent by `api/run-flows.js` still use the older plain layout** — the two no
  longer match.
- **Untrusted HTML:** received mail and the compose preview render only in
  `<iframe sandbox="allow-popups" srcdoc>` with `referrerpolicy="no-referrer"` and a CSP
  meta (`default-src 'none'; img-src https: data:; style-src 'unsafe-inline'`) — no
  `allow-scripts`, no `allow-same-origin`, never `innerHTML`. Checked in a browser with a
  hostile payload: nothing ran, parent page untouched.
- **`middleware.js`:** `/api/` is now a passthrough prefix. Without it, coming-soon mode
  rewrites third-party POSTs (the webhook, the cron) to the holding page.

## Configuration state (as of 2026-09-24)

- **Env vars (Vercel, Production):** `RESEND_API_KEY` (must be Full access to read received
  mail), `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
  `OWNER_EMAIL`. Optional `RESEND_REPLY_TO` — the user added it by hand
  (`replies@prenaevi.resend.app`); this could not be read back (the Vercel MCP is 403 for env
  vars), so confirm a real reply carries it.
- **Resend webhook** → `https://www.propertiesbychel.com/api/webhooks/resend` (**must be
  `www`**: the bare domain 308-redirects and Resend does not follow redirects — this was
  the cause of every event stuck at "Attempting" until fixed). Events: `email.received`,
  `email.sent`, `email.delivered`, `email.bounced`, `email.failed`. A replayed event returned
  200 in production, which also proves the signing secret is right.
- **Receiving:** the domain is set up for sending only. Inbound works through Resend's
  managed address `<anything>@prenaevi.resend.app` (no DNS). A test email to
  `test@prenaevi.resend.app` appeared in Resend → Emails → Receiving and produced a 200
  webhook hit.
- **DNS (GoDaddy):** DKIM (`resend._domainkey`) and SPF/return-path (`send.` subdomain) were
  already present; a DMARC record was added — `_dmarc` TXT
  `v=DMARC1; p=none; rua=mailto:concierge@propertiesbychel.com` (verified resolving).
  **Root MX is Mailgun** (LeadConnector); do not point Resend inbound at the root domain.

## Still open / unverified

- **The compose → Gmail → reply → Inbox loop was never confirmed end to end.** Whether
  `RESEND_REPLY_TO` actually took effect on a real send, and whether a real reply lands as an
  Inbound row, is unverified.
- Whether `migration-email-messages.sql` and `migration-email-organize.sql` were both run by
  hand against the production Supabase project is unverified from this session (no Supabase
  access at the time).
- **Replies to dashboard mail only reach the Inbox if `Reply-To` is an address Resend
  receives for.** `concierge@propertiesbychel.com` routes to Mailgun, so without
  `RESEND_REPLY_TO` a reply never arrives. The `resend.app` Reply-To is visible to
  recipients; a custom inbound subdomain would look better but needs DNS (below).

## Known limitations

- **Only Inbox-sent and inbound mail is recorded.** Flow emails, lead auto-replies
  (`notify-lead.js`) and `send-lead-email.js` sends do not appear here; their delivery events
  hit the webhook, find no row, get a 5xx for 5 minutes (so Resend retries, covering the race
  with the send endpoint's insert), then a 200 — expect some retry noise in Resend's log.
- Flow/lead emails still use the plainer HTML layout with no `List-Unsubscribe`.
- **Attachments are not stored or shown.**
- **The dashboard's service worker (`dashboard-sw.js`) is stale-while-revalidate**, so the first
  load after a deploy can still show the previous dashboard version; a second refresh picks up
  the new one. Local testing needs the service worker unregistered too.
- The signature applies to Inbox compose only; the lead-detail "Compose Email"
  (`api/send-lead-email.js`) and flow emails don't add it.
- **Duplicated code grew:** `requireOwner` now exists in `api/send-lead-email.js`,
  `server/lib/auth.js` and `api/_lib/owner-auth.js`; `renderTemplateHtml` (dashboard) mirrors
  `renderTemplateEmailHtml` (`api/run-flows.js`) by hand.
- **`js/dashboard.js` (~2,400+ lines) and `dashboard.html` are far past the 500-line guideline.**
- Search in the Inbox tab covers loaded rows only (latest 500), not message bodies.
- Trash is never auto-purged; a Resend webhook retry after "Delete forever" could re-insert an
  inbound message.

## Not pursued

- Migrating existing flow/lead sends onto the shared inbox table.
- Storing attachments; threading UI beyond `In-Reply-To`/`References`.
- A custom inbound subdomain — needs DNS records the assistant can't add.

## Possible future work

- Set up `inbox.propertiesbychel.com` (add in Resend with Receiving on, add its records at
  GoDaddy) and switch `RESEND_REPLY_TO` to it.
- After a few weeks of clean DMARC reports, tighten `p=none` to `quarantine`.
- Log flow/auto-reply sends into `email_messages` and add `List-Unsubscribe` + a plain-text
  part to them.
- Consolidate the duplicated owner-auth and template renderers; split `js/dashboard.js`.
- Auto-purge Trash after N days; extend search to message bodies.
