-- Limit the Galaxite report inbox to owner/admin accounts.
drop policy if exists "staff manage reports" on public.content_reports;
drop policy if exists "staff update reports" on public.content_reports;

create policy "admins read content reports"
on public.content_reports
for select
to authenticated
using (public.is_admin());

create policy "admins update content reports"
on public.content_reports
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
