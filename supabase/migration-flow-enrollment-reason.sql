-- Properties by Chel — records why an enrollment was cancelled, so the
-- dashboard can show the owner "template deleted" vs. "lead opted out"
-- instead of an opaque "cancelled" for every case. Run once in the
-- Supabase SQL Editor, after migration-email-flows.sql.

alter table public.lead_flow_enrollments
  add column if not exists cancel_reason text;

-- Counts consecutive transient send failures on the current node, so a
-- persistently-failing send (bad address, Resend outage) eventually stops
-- retrying instead of looping hourly forever with no visibility.
alter table public.lead_flow_enrollments
  add column if not exists send_retry_count integer not null default 0;
