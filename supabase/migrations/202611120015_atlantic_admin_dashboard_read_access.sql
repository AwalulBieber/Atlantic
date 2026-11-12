-- Admin-only read access for the Atlantic overview dashboard.
-- No message bodies or private chat contents are exposed by these policies.
drop policy if exists "Atlantic admins view all conversations" on public.conversations;
create policy "Atlantic admins view all conversations"
on public.conversations for select to authenticated
using (public.is_atlantic_admin((select auth.uid())));

drop policy if exists "Atlantic admins view all conversation members" on public.conversation_members;
create policy "Atlantic admins view all conversation members"
on public.conversation_members for select to authenticated
using (public.is_atlantic_admin((select auth.uid())));

drop policy if exists "Atlantic admins view all call sessions" on public.atlantic_call_sessions;
create policy "Atlantic admins view all call sessions"
on public.atlantic_call_sessions for select to authenticated
using (public.is_atlantic_admin((select auth.uid())));
