-- Properties by Chel — adds a bespoke_path column to developments.
--
-- Some developments have a hand-coded landing page (edades-west.html,
-- the-arton.html, two-botanika.html, …) that is far richer than the generic
-- development?slug=… template the dashboard renders from this table. Which
-- page a card pointed at used to be decided by a BESPOKE_DEV_PAGES map kept
-- in three hardcoded copies — js/listings.js, developer.html, middleware.js —
-- and shipping a new page meant editing all three by hand or the card would
-- silently fall back to the thin generic template.
--
-- bespoke_path makes the record itself the single source of truth. When it is
-- set, every card links straight to that path, development?slug=… redirects
-- to it, and the dashboard hides the page-content fields nothing renders any
-- more. When it is null, the generic page behaves exactly as before.
--
-- Paths are stored root-relative (leading slash) so the same value works from
-- any page in the browser and as a middleware Location header.
-- Run once in the Supabase SQL Editor.

alter table public.developments
  add column if not exists bespoke_path text;

-- Backfill the developments that already have a hand-built page. These pairs
-- are the BESPOKE_DEV_PAGES map this column replaces.
update public.developments set bespoke_path = '/ongpin-tower'      where slug = 'ongpin-tower';
update public.developments set bespoke_path = '/laya-by-shang'     where slug = 'laya-by-shang-properties';
update public.developments set bespoke_path = '/botanika-tower-one' where slug = 'botanika-nature-residences';
update public.developments set bespoke_path = '/two-botanika'      where slug = 'two-botanika-nature-residences';
update public.developments set bespoke_path = '/1001-parkway'      where slug = '1001-parkway-residences';
update public.developments set bespoke_path = '/the-observatory'   where slug = 'the-observatory';
update public.developments set bespoke_path = '/yume-at-riverpark' where slug = 'yume-at-riverpark';
update public.developments set bespoke_path = '/edades-west'       where slug = 'edades-west';
update public.developments set bespoke_path = '/the-arton'         where slug = 'the-arton-by-rockwell';
