-- Properties by Chel — adds an audit log for emails sent to leads from the
-- dashboard (AI-drafted, owner-reviewed, owner-sent), plus an opt-out flag
-- on leads. Run once in the Supabase SQL Editor.
--
-- enrollment_id/step_order stay unused (always null) until the nurture-
-- sequence migration adds lead_sequence_enrollments and a foreign key back
-- onto this table — added now so this table doesn't need touching twice.

create table if not exists public.lead_email_log (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  enrollment_id uuid,
  step_order    integer,
  subject       text not null,
  body_html     text not null,
  goal          text,
  status        text not null default 'sending'
                check (status in ('sending','sent','failed')),
  resend_id     text,
  error         text,
  created_at    timestamptz not null default now()
);

alter table public.lead_email_log enable row level security;

create policy "lead_email_log_owner_all" on public.lead_email_log
  for all using (public.is_owner()) with check (public.is_owner());

-- Dedup guard for sequence-step sends (a lead can only receive a given step
-- of a given enrollment once). One-off sends have enrollment_id null and are
-- unconstrained by this index.
create unique index if not exists lead_email_log_enrollment_step_uq
  on public.lead_email_log (enrollment_id, step_order)
  where enrollment_id is not null;

alter table public.leads add column if not exists email_opt_out boolean not null default false;
