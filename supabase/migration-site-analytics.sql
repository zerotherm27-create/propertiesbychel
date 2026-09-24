-- Properties by Chel — first-party site analytics. One row per visit session
-- (site_sessions) and one per page viewed (site_pageviews), written by
-- api/site/visit.js and api/site/heartbeat.js with the service-role key and
-- read by the dashboard's Analytics tab through api/dashboard/analytics.js.
-- Run once in the Supabase SQL Editor.
--
-- The raw IP address is never stored — only the country/region/city the host
-- derives from it. RLS is ON with an owner-only policy: without it, the public
-- anon key could read and write these tables.

create table if not exists public.site_sessions (
  id               uuid primary key,           -- minted by the API so it can go in the cookie in the same request
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  duration_seconds integer not null default 0,
  landing_path     text,
  page_count       integer not null default 1,
  device_type      text not null default 'unknown'
                   check (device_type in ('mobile','tablet','desktop','unknown')),
  os               text,
  browser          text,
  country          text,
  region           text,
  city             text,
  referrer         text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text
);

create table if not exists public.site_pageviews (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.site_sessions(id) on delete cascade,
  path        text not null,
  occurred_at timestamptz not null default now()
);

-- Keeps duration_seconds equal to last_seen_at - created_at on every write, so the
-- heartbeat only has to bump last_seen_at (one cheap PATCH, no read-modify-write).
create or replace function public.site_sessions_set_duration() returns trigger
language plpgsql as $$
begin
  new.duration_seconds := greatest(0, extract(epoch from (new.last_seen_at - new.created_at))::integer);
  return new;
end $$;

drop trigger if exists site_sessions_duration on public.site_sessions;
create trigger site_sessions_duration before insert or update on public.site_sessions
  for each row execute function public.site_sessions_set_duration();

create index if not exists site_sessions_created_idx on public.site_sessions (created_at desc);
create index if not exists site_pageviews_occurred_idx on public.site_pageviews (occurred_at desc);
create index if not exists site_pageviews_session_idx on public.site_pageviews (session_id);

alter table public.site_sessions enable row level security;
alter table public.site_pageviews enable row level security;

create policy "site_sessions_owner_all" on public.site_sessions
  for all using (public.is_owner()) with check (public.is_owner());
create policy "site_pageviews_owner_all" on public.site_pageviews
  for all using (public.is_owner()) with check (public.is_owner());
