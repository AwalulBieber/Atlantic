drop policy if exists "atlantic calls requested by caller" on public.atlantic_call_sessions;
create policy "atlantic calls requested by caller"
on public.atlantic_call_sessions for insert to authenticated
with check (
  caller_id = (select auth.uid())
  and callee_id <> (select auth.uid())
  and status = 'requested'
  and ended_at is null
  and conversation_id is not null
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = atlantic_call_sessions.conversation_id
      and cm.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = atlantic_call_sessions.conversation_id
      and cm.user_id = atlantic_call_sessions.callee_id
  )
);