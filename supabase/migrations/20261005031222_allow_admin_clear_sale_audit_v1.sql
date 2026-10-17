
drop policy if exists "audit admin delete" on public.audit_log;
create policy "audit admin delete" on public.audit_log
for delete to authenticated
using (public.is_admin());
