-- Atlantic message delivery and read receipts
-- Run once in Supabase Dashboard > SQL Editor.

alter table public.messages
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz;

create index if not exists messages_unread_receipts_idx
  on public.messages(conversation_id, sender_id, read_at);

-- Recipients may update receipt timestamps only; message content remains immutable
-- through this permission grant.
revoke update on table public.messages from anon, authenticated;
grant update (delivered_at, read_at) on table public.messages to authenticated;

drop policy if exists "Atlantic recipients can update message receipts" on public.messages;
create policy "Atlantic recipients can update message receipts"
on public.messages
for update
to authenticated
using (
  sender_id <> auth.uid()
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id
      and cm.user_id = auth.uid()
  )
)
with check (
  sender_id <> auth.uid()
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id
      and cm.user_id = auth.uid()
  )
);

-- Ensure UPDATE events can include the receipt columns for Realtime subscribers.
alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
