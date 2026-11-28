-- Public aggregate counts for the visible chapter list; never exposes who liked a chapter.
create or replace function public.get_chapter_hearts_stats(p_chapter_ids uuid[])
returns table (
  chapter_id uuid,
  hearts_count bigint,
  is_liked boolean
)
language sql
stable
security definer
set search_path = public, auth
as $function$
  select
    c.id as chapter_id,
    count(h.user_id)::bigint as hearts_count,
    coalesce(bool_or(h.user_id = auth.uid()), false) as is_liked
  from public.site_chapters c
  join public.site_works w on w.id = c.work_id
  left join public.site_chapter_hearts h on h.chapter_id = c.id
  where c.is_published = true
    and w.is_published = true
    and p_chapter_ids is not null
    and c.id = any(p_chapter_ids)
  group by c.id;
$function$;

revoke all on function public.get_chapter_hearts_stats(uuid[]) from public;
grant execute on function public.get_chapter_hearts_stats(uuid[]) to anon, authenticated;
