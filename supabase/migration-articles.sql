-- Properties by Chel — adds the Journal/Intelligence "articles" table.
-- Run once in the Supabase SQL Editor (this project already has everything
-- else from schema.sql; this file only adds what's new).

create table if not exists public.articles (
  id                uuid primary key default gen_random_uuid(),
  section           text not null check (section in ('journal','intelligence')),
  title             text not null,
  slug              text not null unique,
  dek               text,
  body              text not null default '',
  hero_image_url    text,
  hero_image_alt    text,
  meta_description  text,
  topic             text,
  ai_generated      boolean not null default false,
  seo_notes         text,
  status            text not null default 'draft' check (status in ('draft','published')),
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.articles enable row level security;

create policy "articles_public_read" on public.articles
  for select using (status = 'published');
create policy "articles_owner_all" on public.articles
  for all using (public.is_owner()) with check (public.is_owner());

drop trigger if exists articles_touch on public.articles;
create trigger articles_touch before update on public.articles
  for each row execute function public.touch_updated_at();
