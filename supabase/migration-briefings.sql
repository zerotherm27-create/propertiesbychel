-- Properties by Chel — adds the "briefings" table (the dashboard's Journal /
-- Intelligence companion-briefing editor). This table was defined in
-- schema.sql but that file only runs once on a brand-new project, so it was
-- never actually created against the already-live database — the dashboard
-- save button has been failing with "Could not find the table
-- 'public.briefings' in the schema cache" ever since. Run once in the
-- Supabase SQL Editor (this project already has everything else from
-- schema.sql + prior migrations; this file only adds what's missing).

create table if not exists public.briefings (
  section      text primary key check (section in ('journal','intelligence')),
  title        text not null,
  eyebrow      text not null default 'Companion Briefing',
  intro        text,
  sections     jsonb not null default '[]'::jsonb,
  spec         jsonb not null default '[]'::jsonb,
  pdf_url      text,
  status       text not null default 'draft' check (status in ('draft','published')),
  updated_at   timestamptz not null default now()
);

alter table public.briefings enable row level security;

create policy "briefings_public_read" on public.briefings
  for select using (status = 'published');
create policy "briefings_owner_all" on public.briefings
  for all using (public.is_owner()) with check (public.is_owner());

drop trigger if exists briefings_touch on public.briefings;
create trigger briefings_touch before update on public.briefings
  for each row execute function public.touch_updated_at();
