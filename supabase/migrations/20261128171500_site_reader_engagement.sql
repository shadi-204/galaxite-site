-- Galaxite reader engagement: account-based one-rating-per-work and one-heart-per-chapter.
create table if not exists public.site_work_ratings (
  work_id uuid not null references public.site_works(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (work_id, user_id)
);

create table if not exists public.site_chapter_hearts (
  chapter_id uuid not null references public.site_chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chapter_id, user_id)
);

create index if not exists site_work_ratings_work_idx
  on public.site_work_ratings (work_id);
create index if not exists site_chapter_hearts_chapter_idx
  on public.site_chapter_hearts (chapter_id);

alter table public.site_work_ratings enable row level security;
alter table public.site_chapter_hearts enable row level security;

revoke all on public.site_work_ratings from anon, authenticated;
revoke all on public.site_chapter_hearts from anon, authenticated;

drop policy if exists site_work_ratings_deny_direct_access on public.site_work_ratings;
create policy site_work_ratings_deny_direct_access
  on public.site_work_ratings for all to anon, authenticated
  using (false) with check (false);

drop policy if exists site_chapter_hearts_deny_direct_access on public.site_chapter_hearts;
create policy site_chapter_hearts_deny_direct_access
  on public.site_chapter_hearts for all to anon, authenticated
  using (false) with check (false);

create or replace function public.get_work_rating_stats(p_work_ids uuid[])
returns table (
  work_id uuid,
  average_rating numeric,
  rating_count bigint,
  my_rating smallint
)
language sql
stable
security definer
set search_path = public, auth
as $function$
  select
    w.id as work_id,
    coalesce(round(avg(r.rating)::numeric, 1), 0::numeric) as average_rating,
    count(r.user_id)::bigint as rating_count,
    max(r.rating) filter (where r.user_id = auth.uid())::smallint as my_rating
  from public.site_works w
  left join public.site_work_ratings r on r.work_id = w.id
  where w.is_published = true
    and p_work_ids is not null
    and w.id = any(p_work_ids)
  group by w.id;
$function$;

create or replace function public.set_work_rating(p_work_id uuid, p_rating integer)
returns table (
  work_id uuid,
  average_rating numeric,
  rating_count bigint,
  my_rating smallint
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 10 then
    raise exception 'Rating must be between 1 and 10' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.site_works
    where id = p_work_id and is_published = true
  ) then
    raise exception 'Published work not found' using errcode = 'P0002';
  end if;

  insert into public.site_work_ratings (work_id, user_id, rating)
  values (p_work_id, v_user_id, p_rating)
  on conflict (work_id, user_id)
  do update set rating = excluded.rating, updated_at = now();

  return query
    select * from public.get_work_rating_stats(array[p_work_id]);
end;
$function$;

create or replace function public.get_chapter_heart_stats(p_chapter_id uuid)
returns table (
  hearts_count bigint,
  is_liked boolean
)
language sql
stable
security definer
set search_path = public, auth
as $function$
  select
    count(h.user_id)::bigint as hearts_count,
    coalesce(bool_or(h.user_id = auth.uid()), false) as is_liked
  from public.site_chapter_hearts h
  where h.chapter_id = p_chapter_id
    and exists (
      select 1
      from public.site_chapters c
      join public.site_works w on w.id = c.work_id
      where c.id = p_chapter_id
        and c.is_published = true
        and w.is_published = true
    );
$function$;

create or replace function public.toggle_chapter_heart(p_chapter_id uuid)
returns table (
  hearts_count bigint,
  is_liked boolean
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_deleted uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.site_chapters c
    join public.site_works w on w.id = c.work_id
    where c.id = p_chapter_id
      and c.is_published = true
      and w.is_published = true
  ) then
    raise exception 'Published chapter not found' using errcode = 'P0002';
  end if;

  delete from public.site_chapter_hearts
  where chapter_id = p_chapter_id and user_id = v_user_id
  returning chapter_id into v_deleted;

  if v_deleted is null then
    insert into public.site_chapter_hearts (chapter_id, user_id)
    values (p_chapter_id, v_user_id)
    on conflict (chapter_id, user_id) do nothing;
  end if;

  return query
    select * from public.get_chapter_heart_stats(p_chapter_id);
end;
$function$;

revoke all on function public.get_work_rating_stats(uuid[]) from public;
revoke all on function public.set_work_rating(uuid, integer) from public;
revoke all on function public.get_chapter_heart_stats(uuid) from public;
revoke all on function public.toggle_chapter_heart(uuid) from public;

revoke all on function public.set_work_rating(uuid, integer) from anon;
revoke all on function public.toggle_chapter_heart(uuid) from anon;

grant execute on function public.get_work_rating_stats(uuid[]) to anon, authenticated;
grant execute on function public.get_chapter_heart_stats(uuid) to anon, authenticated;
grant execute on function public.set_work_rating(uuid, integer) to authenticated;
grant execute on function public.toggle_chapter_heart(uuid) to authenticated;
