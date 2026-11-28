alter table public.site_chapter_processing_jobs
  add column if not exists attempts integer not null default 0 check (attempts >= 0),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;

create or replace function public.claim_site_ingestion_job(p_worker_id text)
returns setof public.site_ingestion_jobs
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if nullif(pg_catalog.btrim(p_worker_id), '') is null then
    raise exception 'Worker ID is required' using errcode = '22023';
  end if;

  update public.site_ingestion_jobs
     set status = 'queued', locked_at = null, locked_by = null, updated_at = pg_catalog.now()
   where status = 'running'
     and locked_at < pg_catalog.now() - interval '20 minutes';

  return query
  with candidate as (
    select id from public.site_ingestion_jobs
     where status = 'queued' and run_after <= pg_catalog.now()
     order by run_after, created_at for update skip locked limit 1
  )
  update public.site_ingestion_jobs j
     set status = 'running', attempts = j.attempts + 1,
         locked_at = pg_catalog.now(), locked_by = p_worker_id, updated_at = pg_catalog.now()
    from candidate where j.id = candidate.id
  returning j.*;
end;
$function$;

create or replace function public.claim_site_chapter_processing_job(p_worker_id text)
returns setof public.site_chapter_processing_jobs
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if nullif(pg_catalog.btrim(p_worker_id), '') is null then
    raise exception 'Worker ID is required' using errcode = '22023';
  end if;

  update public.site_chapter_processing_jobs
     set status = 'queued', locked_at = null, locked_by = null, updated_at = pg_catalog.now()
   where status in ('downloading','ocr','cleaning','translating','typesetting')
     and locked_at < pg_catalog.now() - interval '30 minutes';

  return query
  with candidate as (
    select id from public.site_chapter_processing_jobs
     where status = 'queued'
     order by created_at for update skip locked limit 1
  )
  update public.site_chapter_processing_jobs j
     set status = 'downloading', attempts = j.attempts + 1,
         locked_at = pg_catalog.now(), locked_by = p_worker_id, updated_at = pg_catalog.now()
    from candidate where j.id = candidate.id
  returning j.*;
end;
$function$;

revoke all on function public.claim_site_ingestion_job(text) from public, anon, authenticated;
revoke all on function public.claim_site_chapter_processing_job(text) from public, anon, authenticated;
grant execute on function public.claim_site_ingestion_job(text) to service_role;
grant execute on function public.claim_site_chapter_processing_job(text) to service_role;
