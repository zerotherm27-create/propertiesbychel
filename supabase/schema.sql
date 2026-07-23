-- Properties by Chel — complete backend schema
-- Run once in the Supabase SQL Editor of a fresh project.
-- IMPORTANT: replace concierge@propertiesbychel.com below (3 occurrences in the
-- owner_email() function is the single source of truth) if the owner will log in
-- with a different email address. It must match js/supabase-config.js ownerEmail.

-- ————————————————————————————— helper —————————————————————————————
create or replace function public.is_owner()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'concierge@propertiesbychel.com'
$$;

-- ————————————————————————————— listings —————————————————————————————
create table if not exists public.listings (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  slug           text not null unique,
  status         text not null default 'sale' check (status in ('sale','lease','investment')),
  tag            text,
  collections    text[] not null default '{}',
  location_label text,
  meta_line      text,
  price_display  text,
  overview       text,
  hero_image_url text,
  image_alt      text,
  aspect         text not null default '4/3',
  featured       boolean not null default false,
  published      boolean not null default true,
  sort_order     integer not null default 100,
  created_at     timestamptz not null default now()
);

alter table public.listings enable row level security;

create policy "listings_public_read" on public.listings
  for select using (published = true);
create policy "listings_owner_all" on public.listings
  for all using (public.is_owner()) with check (public.is_owner());

-- ————————————————————————————— leads (CRM) —————————————————————————————
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  name         text,
  email        text,
  phone        text,
  intent       text,
  districts    text,
  budget_range text,
  timeframe    text,
  notes        text,
  source_page  text,
  listing_slug text,
  status       text not null default 'new'
               check (status in ('new','contacted','viewing','negotiating','closed','archived')),
  owner_notes  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.leads enable row level security;

-- visitors may only create leads; only the owner may read/manage them
create policy "leads_public_insert" on public.leads
  for insert to anon, authenticated with check (true);
create policy "leads_owner_select" on public.leads
  for select using (public.is_owner());
create policy "leads_owner_update" on public.leads
  for update using (public.is_owner()) with check (public.is_owner());
create policy "leads_owner_delete" on public.leads
  for delete using (public.is_owner());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- ————————————————————————————— site settings —————————————————————————————
create table if not exists public.site_settings (
  key   text primary key,
  value jsonb not null
);

alter table public.site_settings enable row level security;

create policy "settings_public_read" on public.site_settings
  for select using (true);
create policy "settings_owner_write" on public.site_settings
  for all using (public.is_owner()) with check (public.is_owner());

-- ————————————————————————————— storage —————————————————————————————
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos_public_read" on storage.objects
  for select using (bucket_id = 'photos');
create policy "photos_owner_insert" on storage.objects
  for insert with check (bucket_id = 'photos' and public.is_owner());
create policy "photos_owner_update" on storage.objects
  for update using (bucket_id = 'photos' and public.is_owner());
create policy "photos_owner_delete" on storage.objects
  for delete using (bucket_id = 'photos' and public.is_owner());

-- ————————————————————————————— seed: current site content —————————————————————————————
insert into public.site_settings (key, value) values
  ('hero_image',    jsonb_build_object('url', 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZiVXvXtm65sMooYkIXtQ8PBeHJziP2GMuaK36jOpwLO2-Qt7GkhzT_p_0QFockxhafeSSGRSEh409o6jkUk0bKBVIradXdwmx6JHjptQWS69SUY9BKTtxoxyjWVT0qLyI44bjaJpAzxRquYJWakh3l-HzNc6dzZGmMzSAqQmiJUV2rD0SadPEMnLRI0xxmSKgYYfSSqmti3wq82mmwYyhzKGZdRUMqD28UpLh11XqM0MJ7HSVFzoIiA')),
  ('profile_image', jsonb_build_object('url', 'https://lh3.googleusercontent.com/aida-public/AB6AXuDG8uZu2TxeopOyi6H_Q9dUjx8Iz7x4srMa2_lPjJLg8-wOF-WCqUCvecNwR7AzKJ-5ZQEv4QRQURr-dc7YzLye7DizbRR3X205gFb9ZqK-j1i_mzozr2CvTByK8L9MXIycDznRV8blhxH_G1C_RVUIZAcqpAv7uJ4SUYqg0es73Odja7KUiocsID9wBzc9Q9bh58KIrV7WLd1vCvhOESdXeWOzGkqAWuGUl9iqViuKF4VKR2JGK1TYrw'))
on conflict (key) do nothing;

insert into public.listings
  (title, slug, status, tag, collections, location_label, meta_line, price_display, hero_image_url, image_alt, aspect, featured, sort_order, overview)
values
  ('The Zenith Penthouse', 'the-zenith-penthouse', 'sale', 'Featured', '{skyline}',
   'BGC, Taguig', 'BGC, Taguig · 620 sqm · 4 bedrooms', '₱320M',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuA2Y3OB18yzUWLh26FuflxT2pJwkb5WiojIOZ6R9kLOu_uxZPdWvE6_nO01b6Tkt0_ot4YnOFxk3zqpjmDZocU8-SOosMrrVInV64cMQ8UZnqS_wQnYncTFi-CuoSv_h3uBk1asqlx6CdpfHOYayc3vvk4AhvDumZDGks07RXP7VG_pb-3yhKHqx5funfi-6rMkfzyWk6wNFQFZd3nQ-aF1k5aMxGnv5cbYZkPfB5Kyt1_wlbbQ08-Jsw',
   'Evening skyline view from the Zenith Penthouse, Bonifacio Global City', '4/3', true, 10,
   'A full-floor penthouse above the quietest stretch of Bonifacio Global City — five-metre ceilings in the great room, a west gallery built for art, and services managed to hotel standard. Shown by appointment only.'),
  ('Azure Sands Estate', 'azure-sands-estate', 'sale', null, '{estate}',
   'Station 1, Boracay', 'Station 1, Boracay · 850 sqm · 5 bedrooms', '₱185M',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuBpXAwPUG-_SEHWLJKQBY9Q3-24Tan0jZrvhHpVbj3we60WlviFFto-lDyGSK0EzrxVST6Gb67nqIA8LFQrPeqk2x996I5evjXf7jU-IYVVtf5fNMUmvO5SSwNK-gCPFSe-WY8IqWkc7PeT0as4wgclr7Kej7baNoHu-psfn1tphttvHZPes-7OTWwr06fQ5an6Ebp4zkw-qrccj4zMmxwKYEFObYKIzB3ZZhkGkH6jrFQcc1X85MTHXA',
   'Azure Sands Estate, a beachfront villa with palms and pool, Boracay', '4/5', false, 20, null),
  ('Legacy Manor', 'legacy-manor', 'sale', 'Reserved', '{legacy,estate}',
   'Forbes Park, Makati', 'Forbes Park, Makati · 1,200 sqm · 8 bedrooms', '₱850M',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuA1m8KH8a_w0qfTAqzp8GPrOqOmb2CLo8tFYbPKxQP4rAZDmm3XSxHWT2K18P5k83DqvmsXwBETXXXFHDNM5kh8aTphiCqyUuFUE3T3RYRBEMmhMM2uXLdvyltd30Exa_pcTSdLvHHCdd6DVaAB98_EQ6ImQQrgqHRHCK7Ig31cvuIEHks3nQnm8JYNErqkZrLK_weD7Y_k4I513yIySFp7bbAiFr7qHSoOHZ3R29d2h4vh1i7iopuPqQ',
   'Legacy Manor, a walled family home amid mature trees, Forbes Park', '1/1', false, 30, null),
  ('Meridian Sky Suite', 'meridian-sky-suite', 'lease', null, '{skyline,investment-grade}',
   'Salcedo Village, Makati', 'Salcedo Village, Makati · 210 sqm · 3 bedrooms · for lease', '₱380K / mo',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuAH5TUhcf0HqB9nVoDDdYXPsgvK1IClZ_QDCU0EOrgxdeA2Uv1Q2sFRBNcUilGAPUh1RPmZsoCzT_MVTqWeIiwper6zQUf95Hg3RvSMdOX5gKGlyHo53TQTjEgPoRgzddhs7hUVqmB8gxYM-AjsPRIRnJOmnybGMwP2h-rkKPg96I50PMcQ_xtdht4w9SA-IGjVUa9pWHrrIYYy7BIRF23Aj6sF11wHXl_PFeMvS2HPaPxf8GW7d1VE0Q',
   'Furnished sky suite interior with city outlook, Makati', '16/10', false, 40, null),
  ('Casa Alabang', 'casa-alabang', 'sale', null, '{legacy}',
   'Ayala Alabang', 'Ayala Alabang · 980 sqm lot · 6 bedrooms', '₱260M',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuAKy9sOONkVSwdqp9yGYetZQrV0Vr-1tJlMJM4hdT09ycLT1g9EhY7JTU21Udd5ZYzLOvJ7fHx2c7vuOVZnBUURassQbzl3MQprHU8Imcy9Lpri_t64YwrB0iFhiIxL6YMFpjkrSXBgOjfYI8vOQodVQC1SMZjpB0Wa7yGyNYc-nZOgBJ3MtLD3CNhzaODkY4ocl0NpcVJbuzB4EN7CK6wJROmiHfv7ZAh1Q2cQ8AmOCZgu2vj53n7_hQ',
   'Casa Alabang, a family residence with deep garden setbacks', '4/3', false, 50, null),
  ('Shorewood Villa', 'shorewood-villa', 'sale', null, '{estate}',
   'Mactan, Cebu', 'Mactan, Cebu · 720 sqm · 4 bedrooms', '₱120M',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuAaJ4C3rAr5JrNpZcAJay56E-NHqcg2BlwI9XX-8Q2Cy3NXnsnc55cQDF3IR0Dlbh68Pj4Rr2hSDvdCavG-p4ZJPC2wJnEo6nUISiu_4vsixH5jNtVbLdpl8UO7hAGJ7w_G1cn8_ndyoCDLXw63Ydo007SAqc3i1_s1iNFbiCenIULBjVj547EDKkufNNfEsXNJsNZPmb2wBB9_m5rjLOS8SnL270J1UbZGg72Skx4ZPfTK2MX6PXbWaQ',
   'Shorewood Villa, coastal residence with sea outlook, Mactan', '4/5', false, 60, null),
  ('The Atelier Residence', 'the-atelier-residence', 'lease', null, '{branded}',
   'Rockwell, Makati', 'Rockwell, Makati · 260 sqm · serviced · for lease', '₱480K / mo',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuBI7g_M-I1PxsaO3LU0P2902V5sqJLno9FR5hRd2Dl7X2KV0JcJMv7E8i2StmpTs0nAdDwXQj1_k0a-VSKRbgxBMiyYix77DK7tvAqvXQ5YBZlhBJpaiUYXvPuCxSwfDBzb5WbD8eMtnaTo8wdpvEYqZBHnjLWQ6iFAa7KlCgS8mdl9vYVeTMlGzjUKDy_NIAm7C_yfnrIBODNT0ty454A-4sQ8OUWsrF9794LWx7M-VpOorq6a3JdwUA',
   'The Atelier Residence, serviced interior with gallery lighting, Rockwell', '1/1', false, 70, null),
  ('Harbourline Allocation', 'harbourline-allocation', 'investment', 'Allocation', '{branded,investment-grade}',
   'BGC, Taguig', 'BGC, Taguig · pre-completion branded residences · investment', 'From ₱65M',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuCE_KZSE7BdRV7kHHen_uSXeiLzhRKyADuUsx-i5GnE3-pytxUaV9p2J16UB-dzzwVdYv7ZmYyY9G2YTS8gOc3kp9Oq1ztS8SFYn35KC-icr5dLAyc8oMrBz6_i_tWQLnfk8qptgJaBzS2y2nji7PHZhdyCwohaFDeuTzkdYPhXQ8R8htIg9kdC-d3XvMl3Poo9it8eohFwjJJUdvrrpivPlc0Pt02fC9X1JUSpPza8faCZ1O-GdSDbsg',
   'Harbourline branded residences tower under evening light', '16/10', false, 80, null)
on conflict (slug) do nothing;
