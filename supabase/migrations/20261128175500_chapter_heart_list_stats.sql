-- Efficient aggregate heart counts for a list of published chapters.
create or replace function public.get_chapter_heart_stats_many(p_chapter_ids uuid[])
returns table (
  chapter_id uuid,
  hearts_count bigint,
  is_liked boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    c.id as chapter_id,
    count(h.user_id)::bigint as hearts_count,
    coalesce(bool_or(h.user_id = auth.uid()), false) as is_liked
  from public.site_chapters c
  join public.site_works w on w.id = c.work_id
  left join public.site_chapter_hearts h on h.chapter_id = c.id
  where p_chapter_ids is not null
    and cardinality(p_chapter_ids) between 1 and 100
    and c.id = any(p_chapter_ids)
    and c.is_published = true
    and w.is_published = true
  group by c.id;
$function$;

revoke all on function public.get_chapter_heart_stats_many(uuid[]) from public;
revoke all on function public.get_chapter_heart_stats_many(uuid[]) from anon, authenticated;
grant execute on function public.get_chapter_heart_stats_many(uuid[]) to anon, authenticated;
