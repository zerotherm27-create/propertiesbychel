-- Properties by Chel — adds a real "developers" table. developments.developer_name
-- was a free-text column with no dedupe, which risked typo-duplicates like
-- "Filigree" vs "Filigree Properties" silently splitting into two groups on
-- /developer. Run once in the Supabase SQL Editor (this project already has
-- everything else from schema.sql + migration-developments.sql; this file
-- only adds what's new).

create table if not exists public.developers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  published    boolean not null default true,
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.developers enable row level security;

create policy "developers_public_read" on public.developers
  for select using (published = true);
create policy "developers_owner_all" on public.developers
  for all using (public.is_owner()) with check (public.is_owner());

drop trigger if exists developers_touch on public.developers;
create trigger developers_touch before update on public.developers
  for each row execute function public.touch_updated_at();

-- ————————————————————————————— developments ↔ developers —————————————————————————————
alter table public.developments
  add column if not exists developer_id uuid references public.developers(id) on delete set null;

-- Backfill: one developers row per distinct existing developer_name, then
-- point every development at it. developments.developer_name is deliberately
-- NOT dropped here — it stays as a fallback/rollback path until the
-- dashboard and public pages are confirmed fully migrated to developer_id
-- in production; drop it in a separate follow-up migration later.
insert into public.developers (name, slug)
select distinct on (lower(trim(developer_name)))
  trim(developer_name),
  regexp_replace(regexp_replace(lower(trim(developer_name)), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')
from public.developments
where developer_name is not null and trim(developer_name) <> ''
on conflict (slug) do nothing;

update public.developments d
set developer_id = dv.id
from public.developers dv
where d.developer_id is null
  and d.developer_name is not null
  and trim(d.developer_name) <> ''
  and lower(trim(d.developer_name)) = lower(dv.name);
