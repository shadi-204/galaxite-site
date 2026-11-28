-- Remove the obsolete hard-coded placeholder-email owner promotion flow.
-- Administrative access is determined by the protected profiles.role value instead.
drop trigger if exists zz_assign_solo_admin_role on auth.users;
drop trigger if exists zzzzz_assign_owner_on_email_confirmation on auth.users;
drop function if exists public.assign_solo_admin_role();
