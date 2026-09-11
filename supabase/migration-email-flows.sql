-- Properties by Chel — visual, branching nurture flows (Milestone 3b),
-- replacing the linear sequence model from an earlier pass that never went
-- live. Run once in the Supabase SQL Editor, after
-- migration-email-templates.sql. Safe even if the earlier
-- migration-lead-sequences.sql was never run.

drop table if exists public.lead_sequence_enrollments;
drop table if exists public.email_sequences;

create table if not exists public.email_flows (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  graph      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_flows enable row level security;

create policy "email_flows_owner_all" on public.email_flows
  for all using (public.is_owner()) with check (public.is_owner());

drop trigger if exists email_flows_touch on public.email_flows;
create trigger email_flows_touch before update on public.email_flows
  for each row execute function public.touch_updated_at();

create table if not exists public.lead_flow_enrollments (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  flow_id         uuid not null references public.email_flows(id) on delete restrict,
  current_node_id text not null,
  node_entered_at timestamptz not null default now(),
  next_check_at   timestamptz not null default now(),
  status          text not null default 'active'
                  check (status in ('active','paused','completed','cancelled')),
  enrolled_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

alter table public.lead_flow_enrollments enable row level security;

create policy "lead_flow_enrollments_owner_all" on public.lead_flow_enrollments
  for all using (public.is_owner()) with check (public.is_owner());

create unique index if not exists lead_flow_enroll_active_uq
  on public.lead_flow_enrollments (lead_id, flow_id) where status = 'active';

alter table public.lead_email_log add column if not exists node_id text;
alter table public.lead_email_log
  add constraint lead_email_log_enrollment_fk
  foreign key (enrollment_id) references public.lead_flow_enrollments(id) on delete set null;

-- Dedup lock for a flow-driven send: the same enrollment can't send the same
-- Send Email node twice. (The earlier partial index on (enrollment_id,
-- step_order), from a linear-sequence design that never shipped, is unused
-- by anything now — flow sends key on node_id instead.)
create unique index if not exists lead_email_log_enrollment_node_uq
  on public.lead_email_log (enrollment_id, node_id)
  where enrollment_id is not null and node_id is not null;
