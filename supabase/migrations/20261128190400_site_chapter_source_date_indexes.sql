CREATE INDEX IF NOT EXISTS idx_site_chapters_source_published_at
  ON public.site_chapters (source_published_at DESC)
  WHERE is_published IS TRUE
    AND source_published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_site_chapters_work_source_published_at
  ON public.site_chapters (work_id, source_published_at DESC)
  WHERE is_published IS TRUE
    AND source_published_at IS NOT NULL;
