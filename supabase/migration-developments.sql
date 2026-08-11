-- Properties by Chel — adds the "developments" table (whole buildings/
-- projects, e.g. Ongpin Tower) and links listings to one, optionally.
-- Run once in the Supabase SQL Editor (this project already has everything
-- else from schema.sql; this file only adds what's new).

create table if not exists public.developments (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  developer_name    text,
  tagline           text,
  location_label    text,
  meta_line         text,
  overview          text,
  meta_description  text,
  hero_image_url    text,
  image_alt         text,
  gallery_images    jsonb not null default '[]'::jsonb,
  amenities         text[] not null default '{}',
  map_lat           double precision,
  map_lng           double precision,
  location_features jsonb not null default '[]'::jsonb,
  featured          boolean not null default false,
  published         boolean not null default true,
  sort_order        integer not null default 100,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.developments enable row level security;

create policy "developments_public_read" on public.developments
  for select using (published = true);
create policy "developments_owner_all" on public.developments
  for all using (public.is_owner()) with check (public.is_owner());

drop trigger if exists developments_touch on public.developments;
create trigger developments_touch before update on public.developments
  for each row execute function public.touch_updated_at();

-- ————————————————————————————— listings ↔ developments —————————————————————————————
alter table public.listings
  add column if not exists development_id uuid references public.developments(id) on delete set null;
