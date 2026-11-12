create table if not exists public.saved_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  saved_at timestamptz not null default now(),
  constraint saved_messages_user_message_key unique (user_id, message_id)
);
create index if not exists saved_messages_user_saved_at_idx on public.saved_messages (user_id, saved_at desc);
alter table public.saved_messages enable row level security;
grant select, insert, delete on public.saved_messages to authenticated;
drop policy if exists "Users read own saved messages" on public.saved_messages;
drop policy if exists "Users save messages in their conversations" on public.saved_messages;
drop policy if exists "Users unsave own messages" on public.saved_messages;
create policy "Users read own saved messages" on public.saved_messages
for select to authenticated
using (user_id = (select auth.uid()) and exists (
  select 1 from public.conversation_members cm
  join public.messages m on m.conversation_id = cm.conversation_id
  where m.id = saved_messages.message_id and cm.user_id = (select auth.uid())
));
create policy "Users save messages in their conversations" on public.saved_messages
for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.conversation_members cm
  join public.messages m on m.conversation_id = cm.conversation_id
  where m.id = saved_messages.message_id and cm.user_id = (select auth.uid())
));
create policy "Users unsave own messages" on public.saved_messages
for delete to authenticated
using (user_id = (select auth.uid()));