create table if not exists public.site_content_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  display_name text not null,
  base_url text,
  adapter_key text not null,
  enabled boolean not null default false,
  authorization_status text not null default 'pending'
    check (authorization_status in ('pending','authorized','restricted')),
  poll_interval_minutes integer not null default 60
    check (poll_interval_minutes between 5 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.site_content_sources(id) on delete restrict,
  job_type text not null
    check (job_type in ('discover_works','discover_chapters','fetch_chapter','localize_chapter')),
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','needs_attention','cancelled')),
  external_work_id text,
  external_chapter_id text,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists site_ingestion_jobs_queue_idx
  on public.site_ingestion_jobs (status, run_after, created_at);
create index if not exists site_ingestion_jobs_source_idx
  on public.site_ingestion_jobs (source_id, created_at desc);

create table if not exists public.site_chapter_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null unique references public.site_chapters(id) on delete cascade,
  source_id uuid references public.site_content_sources(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued','downloading','ocr','cleaning','translating','typesetting','ready','published','failed')),
  total_pages integer not null default 0 check (total_pages >= 0),
  completed_pages integer not null default 0 check (completed_pages >= 0),
  settings jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  check (completed_pages <= total_pages or total_pages = 0)
);

create index if not exists site_chapter_processing_status_idx
  on public.site_chapter_processing_jobs (status, updated_at desc);

alter table public.site_content_sources enable row level security;
alter table public.site_ingestion_jobs enable row level security;
alter table public.site_chapter_processing_jobs enable row level security;

drop policy if exists "Admins manage content sources" on public.site_content_sources;
create policy "Admins manage content sources"
on public.site_content_sources for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage ingestion jobs" on public.site_ingestion_jobs;
create policy "Admins manage ingestion jobs"
on public.site_ingestion_jobs for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage chapter processing jobs" on public.site_chapter_processing_jobs;
create policy "Admins manage chapter processing jobs"
on public.site_chapter_processing_jobs for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.site_content_sources to authenticated;
grant select, insert, update, delete on public.site_ingestion_jobs to authenticated;
grant select, insert, update, delete on public.site_chapter_processing_jobs to authenticated;

insert into public.site_content_sources (source_key, display_name, adapter_key, enabled, authorization_status)
values
  ('asura_scans', 'Asura Scans', 'asura_scans', false, 'pending'),
  ('teamx', 'Team-X', 'teamx', false, 'pending'),
  ('azora', 'Azora', 'azora', false, 'pending')
on conflict (source_key) do nothing;
