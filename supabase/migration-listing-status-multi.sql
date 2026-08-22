-- Properties by Chel — converts listings.status from a single value to a
-- multi-value array, so one listing can be tagged e.g. both "For sale" and
-- "For lease" at once. Existing rows keep their current single value,
-- wrapped in an array. Run once in the Supabase SQL Editor.

alter table public.listings alter column status drop default;

-- Must drop the old scalar check constraint before changing the column
-- type: otherwise Postgres re-validates it against the new text[] type
-- mid-conversion and fails with "operator does not exist: text[] = text".
alter table public.listings drop constraint if exists listings_status_check;

alter table public.listings
  alter column status type text[] using array[status]::text[];

alter table public.listings alter column status set default '{sale}';

alter table public.listings
  add constraint listings_status_check
  check (status <@ array['sale','lease','investment']::text[] and array_length(status, 1) > 0);
