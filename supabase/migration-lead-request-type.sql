-- Split "Request the current briefing" (a content download) from the
-- Private Presentation funnel (a sales inquiry) so the two aren't
-- indistinguishable in the CRM. Run once against an existing project;
-- a fresh install already gets this column via schema.sql.

alter table public.leads
  add column if not exists request_type text not null default 'presentation';

alter table public.leads drop constraint if exists leads_request_type_check;
alter table public.leads
  add constraint leads_request_type_check
  check (request_type in ('presentation', 'briefing', 'contact'));
