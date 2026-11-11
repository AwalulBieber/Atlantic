-- Atlantic: allow users to delete only messages they sent.
-- Run once in Supabase Dashboard > SQL Editor.

drop policy if exists "Atlantic users can delete their own messages" on public.messages;
create policy "Atlantic users can delete their own messages"
on public.messages
for delete
to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id
      and cm.user_id = auth.uid()
  )
);

grant delete on public.messages to authenticated;


-- Include conversation_id in DELETE realtime payloads so the other chat
-- participant can remove the matching message from the open conversation.
alter table public.messages replica identity full;
