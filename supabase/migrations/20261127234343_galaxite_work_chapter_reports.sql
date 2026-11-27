-- Add work and chapter reporting support while preserving existing social reports.
alter table public.content_reports
  alter column target_id type text using target_id::text;

alter table public.content_reports
  drop constraint if exists content_reports_target_type_check;

alter table public.content_reports
  add constraint content_reports_target_type_check
  check (target_type = any (array['profile','review','comment','work','chapter']::text[]));

alter table public.content_reports
  add column if not exists details text not null default '',
  add column if not exists target_title text,
  add column if not exists target_path text;

alter table public.content_reports
  drop constraint if exists content_reports_details_check;

alter table public.content_reports
  add constraint content_reports_details_check
  check (char_length(details) <= 1000);

create index if not exists content_reports_status_created_idx
  on public.content_reports (status, created_at desc);

create index if not exists content_reports_target_lookup_idx
  on public.content_reports (target_type, target_id);
