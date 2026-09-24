# Handoff — first-party site analytics (visits, location, devices, sources)

Visitor analytics built into the site and the owner dashboard: no third-party analytics
service, no advertising tracker, no extra cost. Adapted from `first-party-site-analytics-playbook.md`
(written for Next.js) to this repo's stack: static HTML + Vercel functions + Supabase.

The previous handoff (the headless Inbox/Outbox) was replaced per the repo convention; it is
at `git show d311322:docs/handoff.md`. **Still open from that work:** the compose → Gmail →
reply → Inbox loop was never confirmed end to end; whether `RESEND_REPLY_TO` took effect and
the `email_messages` migration was run are unverified; flow/lead emails still use the plainer
HTML layout with no `List-Unsubscribe`.

## What was built

- **Data — `supabase/migration-site-analytics.sql` (must be run by hand in the Supabase SQL
  editor before anything records).** `site_sessions` (one row per visit: device type, OS,
  browser, country, region, city, referrer, utm_*, landing path, page count, duration) and
  `site_pageviews` (one row per page view). A trigger keeps `duration_seconds = last_seen_at −
  created_at`, so the heartbeat only bumps `last_seen_at`. **RLS is on with an owner-only
  policy** — the playbook says "no RLS", which on Supabase would leave both tables open to the
  public anon key.
- **Capture — `js/visit.js`** (loaded on every public page by a two-line loader appended to
  `js/site.js`; the coming-soon page includes it directly). Posts one page view per load to
  `/api/site/visit` and beacons `/api/site/heartbeat` every 15 s while the tab is visible and on
  page hide. Sends only the path, `?slug=`, `utm_*` tags, referrer, and a touch flag. Skips
  `/dashboard`, browsers sending Do Not Track / Global Privacy Control, and any browser where the
  owner ticked "Don't count visits from this browser" (`localStorage pbc_no_track`).
- **Endpoints — `api/site/visit.js`, `api/site/heartbeat.js`, helpers in `api/_lib/visitor.js`.**
  Session = activity inside a sliding 30-minute window, held in an httpOnly, SameSite=Lax,
  Secure `pbc_sid` cookie. User-agent parsed with `ua-parser-js` (new dependency); bots and empty
  user agents are dropped (still 204). Location comes from Vercel's `x-vercel-ip-country /
  -country-region / -city` headers — **the IP address is never stored**. iPadOS reports a Mac
  user agent, so a Mac UA plus touch support is classed as a tablet. Referrer is kept as
  origin + path only, and the site's own pages don't count as a referrer. Paths drop the query
  except `?slug=` (which is what tells one property page from another). Both routes always
  answer 204 and swallow errors, so analytics can never break a page. Route names are
  deliberately boring (ad blockers match "track"/"analytics").
- **Reporting — `api/dashboard/analytics.js`** (`GET ?range=24h|7d|30d|90d`, owner-only, reads
  with the caller's own token so RLS is the authorization, pages through PostgREST 1,000 rows at
  a time up to 60k per table). Returns totals (visitors, pageviews, avg session, bounce rate,
  active now = seen in the last 5 minutes), a zero-filled time series (hourly for 24h, daily
  otherwise, in Philippine time UTC+8), breakdowns (countries, regions, cities, devices, OS,
  browsers, top pages, landing pages, traffic sources) and the 30 most recent visitors.
  Bounce rate = sessions with exactly one page view. Traffic source = `utm_source`, else the
  referrer's hostname, else "direct".
- **Dashboard — Analytics tab** (`dashboard.html`, `js/dashboard-analytics.js`, bridged in via
  `window.DashboardAnalytics` like `dashboard-content.js`): stat cards, an inline-SVG line chart
  (visitors + pageviews), ranked bar-lists for every breakdown, a recent-visitors table, a range
  selector, auto-refresh every 30 s while the tab is open, and a clear message if the migration
  hasn't been run. Every visitor-controlled string goes through `esc()`.
- **Privacy notice — `legal.html`** now discloses the visit statistics, the 30-minute session
  cookie, and the Do Not Track / GPC behaviour, without claiming a retention period.

## Verification done

Mocked-database tests (not committed): new/returning/expired sessions, cookie flags, bot and empty-
UA skipping, referrer/path/utm handling, no IP stored, heartbeat can't revive an expired session,
DB failure still 204; aggregation paging past 1,000 rows, bucket zero-fill, Manila date rollover,
auth (401/403), bad range, missing tables → 503 with a hint. In a browser: the tab renders against
mock data including hostile strings (`<img onerror>`, `<script>`) — they display as text, nothing
executes. **Not verified against the real database or from real traffic** — the migration hadn't
been run when this shipped.

## Known limitations

- **Nothing records until the migration is run.** The visit endpoints silently return 204 when
  the insert fails.
- **Region values are shown as the code Vercel reports** (e.g. Metro Manila may appear as "00");
  no lookup table was written because the real values haven't been seen yet.
- Geo is approximate (city can be wrong for mobile carriers and VPNs).
- Sessions with a single page view and no heartbeat show ~0 s, which pulls the average down.
- The owner's own visits count unless they tick the exclude box on each browser.
- Bounce rate is a deliberate simplification (single page view), not GA4's "engaged session".
- No retention/cleanup job; rows accumulate. A cookie is set for every counted visitor, which
  some jurisdictions expect consent for — no consent banner was added.
- Hourly/daily buckets are hardcoded to UTC+8.
- Aggregation is in application code; very high traffic would need SQL aggregates (a 60k-row cap
  is flagged in the UI when hit).

## Possible future work

- Once real rows exist, map Vercel's region codes to readable names.
- Link a session to a lead when a visitor submits an enquiry (`lead_id`, from the playbook).
- Retention job (e.g. delete sessions older than N months) and state the period in the notice.
- A cookie/consent notice if visitors from consent-required regions matter.
- Split `js/dashboard.js` (still far past the 500-line guideline).
