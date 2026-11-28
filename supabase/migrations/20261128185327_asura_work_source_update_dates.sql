ALTER TABLE public.site_works
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;

UPDATE public.site_works AS work
SET source_updated_at = latest.latest_source_published_at
FROM (
  SELECT work_id, MAX(source_published_at) AS latest_source_published_at
  FROM public.site_chapters
  WHERE is_published IS TRUE
    AND source_published_at IS NOT NULL
  GROUP BY work_id
) AS latest
WHERE work.id = latest.work_id
  AND work.source_updated_at IS DISTINCT FROM latest.latest_source_published_at;

CREATE INDEX IF NOT EXISTS idx_site_works_source_updated_at
  ON public.site_works (source_updated_at DESC)
  WHERE is_published IS TRUE;
