-- Promote the configured Galaxite account only after Supabase confirms its email.
-- Existing verified owner accounts retain their current owner role as a fallback.

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role::text = 'owner'
  );
$function$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

create or replace function public.assign_solo_admin_role()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if lower(coalesce(new.email, '')) = 'ownermail@gmail.com'
     and new.email_confirmed_at is not null
  then
    perform pg_catalog.set_config('app.role_assignment', 'trusted', true);
    update public.profiles
       set role = 'owner'::public.app_role,
           updated_at = pg_catalog.now()
     where id = new.id;
    perform pg_catalog.set_config('app.role_assignment', '', true);
  end if;
  return new;
end;
$function$;

create or replace function private.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_role text;
begin
  if new.role is distinct from old.role then
    if pg_catalog.current_setting('app.role_assignment', true) = 'trusted' then
      return new;
    end if;

    if old.role::text = 'owner' and new.role::text <> 'owner' then
      raise exception 'The owner role is permanent';
    end if;

    select p.role::text
      into actor_role
      from public.profiles p
     where p.id = (select auth.uid());

    if actor_role = 'owner' then
      return new;
    end if;

    if actor_role = 'admin'
       and old.role::text in ('user','moderator')
       and new.role::text in ('user','moderator') then
      return new;
    end if;

    raise exception 'Only an owner can assign administrator roles; admins may manage users and moderators';
  end if;
  return new;
end;
$function$;

create or replace function public.assign_profile_role(target_profile_id uuid, requested_role text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  actor_role text;
  target_role text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if requested_role not in ('user','moderator','admin') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  select p.role::text
    into actor_role
    from public.profiles p
   where p.id = actor_id;

  if actor_role = 'owner' then
    null;
  elsif actor_role = 'admin' then
    if requested_role = 'admin' then
      raise exception 'Only the owner can assign administrator roles' using errcode = '42501';
    end if;
  else
    raise exception 'Not authorized to manage roles' using errcode = '42501';
  end if;

  select p.role::text into target_role
    from public.profiles p
   where p.id = target_profile_id
   for update;
  if target_role is null then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if target_role = 'owner' then
    raise exception 'The owner role is permanent' using errcode = '42501';
  end if;
  if actor_role = 'admin' and target_role = 'admin' then
    raise exception 'Admins cannot change another admin' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('app.role_assignment', 'trusted', true);
  update public.profiles
     set role = requested_role::public.app_role,
         updated_at = pg_catalog.now()
   where id = target_profile_id;
  perform pg_catalog.set_config('app.role_assignment', '', true);
end;
$function$;

drop policy if exists "Primary owner can manage profile roles" on public.profiles;
create policy "Primary owner can manage profile roles"
on public.profiles
for update
to authenticated
using (public.is_owner())
with check (public.is_owner());

drop trigger if exists zzzzz_assign_owner_on_email_confirmation on auth.users;
create trigger zzzzz_assign_owner_on_email_confirmation
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.assign_solo_admin_role();
