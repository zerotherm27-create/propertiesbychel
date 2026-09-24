-- Properties by Chel — organize the dashboard inbox: read/unread, star, archive, and
-- move-to-trash (deleted_at). Adds four columns to public.email_messages; existing
-- owner-only RLS already covers them, so the dashboard updates rows directly.
-- Run once in the Supabase SQL Editor (after migration-email-messages.sql).
--
-- deleted_at set = in Trash (restorable); the row is only removed by "Delete forever".
-- Existing inbound messages start as unread; sent messages ignore is_read.

alter table public.email_messages
  add column if not exists is_read     boolean not null default false,
  add column if not exists is_starred  boolean not null default false,
  add column if not exists is_archived boolean not null default false,
  add column if not exists deleted_at  timestamptz;

create index if not exists email_messages_folder_idx
  on public.email_messages (deleted_at, is_archived, direction, created_at desc);
