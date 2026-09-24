-- Properties by Chel — headless inbox/outbox. One row per email the dashboard
-- sent (OUTBOUND) or Resend received on the inbound address (INBOUND), so the
-- dashboard can show both as a single feed. Run once in the Supabase SQL Editor.
--
-- Separate from lead_email_log on purpose: that table is lead-scoped and
-- audits flow/one-off sends to leads; this one is the general mailbox.
-- Rows are written by api/webhooks/resend.js (service role) and
-- api/dashboard/email/send.js (owner token); the dashboard reads via RLS.

create table if not exists public.email_messages (
  id           uuid primary key default gen_random_uuid(),
  -- Resend's id for the message (send response / webhook email_id). A plain
  -- unique constraint (not a partial index) so PostgREST can upsert on it;
  -- nulls are distinct, so rows without one never collide.
  resend_id    text unique,
  -- The RFC 5322 Message-ID header — what replies thread on.
  message_id   text,
  in_reply_to  text,
  direction    text not null check (direction in ('INBOUND','OUTBOUND')),
  from_address text not null,
  to_address   text not null,
  subject      text not null default '',
  html_body    text,
  text_body    text,
  status       text not null
               check (status in ('SENT','DELIVERED','BOUNCED','RECEIVED','FAILED')),
  lead_id      uuid references public.leads(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists email_messages_direction_created_idx
  on public.email_messages (direction, created_at desc);
create index if not exists email_messages_message_id_idx
  on public.email_messages (message_id);

alter table public.email_messages enable row level security;

create policy "email_messages_owner_all" on public.email_messages
  for all using (public.is_owner()) with check (public.is_owner());
