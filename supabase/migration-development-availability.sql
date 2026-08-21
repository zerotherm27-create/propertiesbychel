-- Properties by Chel — adds a sales-status "availability" column to
-- developments. Listings already have a status field (For sale/lease/
-- investment), but a whole development never had an equivalent — there was
-- nowhere to say a project was pre-selling, selling, sold out, or ready for
-- occupancy. Run once in the Supabase SQL Editor (this project already has
-- everything else from schema.sql + prior migrations; this file only adds
-- what's new).

alter table public.developments
  add column if not exists availability text not null default 'selling'
    check (availability in ('pre-selling','selling','sold-out','rfo'));
