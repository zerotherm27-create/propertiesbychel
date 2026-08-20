-- Properties by Chel — adds a collections column to developments, matching
-- the one listings already has. Developments now render natively in the
-- public Collections grid (see migration-developers.sql era work), but had
-- no way to be tagged into a specific collection (Skyline residences,
-- Estate lots & villas, etc.) -- they could only ever show under "All".
-- Run once in the Supabase SQL Editor.

alter table public.developments
  add column if not exists collections text[] not null default '{}';
