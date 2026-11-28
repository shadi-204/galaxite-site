ALTER TABLE public.site_chapters
  ADD COLUMN IF NOT EXISTS display_title text,
  ADD COLUMN IF NOT EXISTS source_published_at timestamptz;

WITH extracted AS (
  SELECT
    id,
    title,
    created_at,
    regexp_match(
      title,
      '([A-Za-z]{3,9}[[:space:]]+[0-9]{1,2},[[:space:]]+[0-9]{4})$',
      'i'
    ) AS date_match,
    regexp_match(
      title,
      '(just now|yesterday|last week|last month|last year|(?:a|an|one|[0-9]+)[[:space:]]+(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)[[:space:]]+ago)$',
      'i'
    ) AS age_match
  FROM public.site_chapters
  WHERE source_url LIKE 'https://asurascans.com/%'
    AND title IS NOT NULL
),
parsed AS (
  SELECT
    id,
    CASE
      WHEN date_match IS NOT NULL THEN
        (
          (
            CASE
              WHEN length(split_part(date_match[1], ' ', 1)) > 3
                THEN to_date(date_match[1], 'FMMonth FMDD, YYYY')
              ELSE to_date(date_match[1], 'Mon FMDD, YYYY')
            END
          )::timestamp + time '12:00:00'
        ) AT TIME ZONE 'UTC'
      WHEN age_match IS NOT NULL AND lower(age_match[1]) = 'just now'
        THEN created_at
      WHEN age_match IS NOT NULL AND lower(age_match[1]) = 'yesterday'
        THEN created_at - interval '1 day'
      WHEN age_match IS NOT NULL AND lower(age_match[1]) = 'last week'
        THEN created_at - interval '7 days'
      WHEN age_match IS NOT NULL AND lower(age_match[1]) = 'last month'
        THEN created_at - interval '30 days'
      WHEN age_match IS NOT NULL AND lower(age_match[1]) = 'last year'
        THEN created_at - interval '365 days'
      WHEN age_match IS NOT NULL THEN
        created_at - (
          CASE
            WHEN lower(age_match[1]) ~ '^(a|an|one)[[:space:]]'
              THEN regexp_replace(age_match[1], '^(a|an|one)[[:space:]]+', '1 ', 'i')
            ELSE regexp_replace(age_match[1], '[[:space:]]+ago$', '', 'i')
          END
        )::interval
      ELSE NULL
    END AS source_published_at,
    regexp_replace(
      title,
      '[[:space:]]+(?:[A-Za-z]{3,9}[[:space:]]+[0-9]{1,2},[[:space:]]+[0-9]{4}|just now|yesterday|last week|last month|last year|(?:a|an|one|[0-9]+)[[:space:]]+(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)[[:space:]]+ago)$',
      '',
      'i'
    ) AS display_title
  FROM extracted
  WHERE date_match IS NOT NULL OR age_match IS NOT NULL
)
UPDATE public.site_chapters AS chapter
SET
  display_title = COALESCE(chapter.display_title, parsed.display_title),
  source_published_at = COALESCE(chapter.source_published_at, parsed.source_published_at)
FROM parsed
WHERE chapter.id = parsed.id;
