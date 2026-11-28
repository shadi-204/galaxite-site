-- Allow the source-specific Asura chapter fetch job handled by the worker.
alter table public.site_ingestion_jobs
  drop constraint if exists site_ingestion_jobs_job_type_check;

alter table public.site_ingestion_jobs
  add constraint site_ingestion_jobs_job_type_check
  check (job_type in (
    'discover_works',
    'discover_chapters',
    'fetch_chapter',
    'fetch_asura_chapter',
    'localize_chapter'
  ));
