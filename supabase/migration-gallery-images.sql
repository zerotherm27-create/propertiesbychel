-- Properties by Chel — adds a gallery_images field to listings so a
-- property can carry more than one photo. Run once in the Supabase SQL Editor.

alter table public.listings
  add column if not exists gallery_images jsonb not null default '[]'::jsonb;
