-- These control tables are only accessed inside narrowly authorized RPCs.
-- Explicit deny policies provide defense in depth if grants are changed later.
drop policy if exists "No direct client access to Atlantic admin registry" on public.atlantic_admins;
create policy "No direct client access to Atlantic admin registry"
on public.atlantic_admins for all to anon, authenticated
using (false) with check (false);

drop policy if exists "No direct client access to Atlantic invite registry" on public.atlantic_invite_links;
create policy "No direct client access to Atlantic invite registry"
on public.atlantic_invite_links for all to anon, authenticated
using (false) with check (false);
