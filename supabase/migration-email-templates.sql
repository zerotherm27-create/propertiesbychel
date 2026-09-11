-- Properties by Chel — reusable email templates for the automation system
-- (Milestone 3a). Run once in the Supabase SQL Editor.

create table if not exists public.email_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null default 'general'
                check (category in ('general','buyer','seller','investor','foreign-buyer')),
  subject       text not null default '',
  heading       text not null default '',
  body          text not null default '',
  button_text   text,
  button_url    text,
  art_image_url text,
  ai_generated  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.email_templates enable row level security;

create policy "email_templates_owner_all" on public.email_templates
  for all using (public.is_owner()) with check (public.is_owner());

drop trigger if exists email_templates_touch on public.email_templates;
create trigger email_templates_touch before update on public.email_templates
  for each row execute function public.touch_updated_at();
