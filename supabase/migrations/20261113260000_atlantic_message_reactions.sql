create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','🙏','🔥','👏')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);
alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from public, anon;
grant select, insert, update, delete on public.message_reactions to authenticated;
create policy "Conversation members read message reactions" on public.message_reactions for select to authenticated
using (exists (select 1 from public.messages m where m.id=message_reactions.message_id and public.is_conversation_member(m.conversation_id)));
create policy "Users add own message reactions" on public.message_reactions for insert to authenticated
with check (user_id=(select auth.uid()) and exists (select 1 from public.messages m where m.id=message_reactions.message_id and public.is_conversation_member(m.conversation_id)));
create policy "Users update own message reactions" on public.message_reactions for update to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()) and exists (select 1 from public.messages m where m.id=message_reactions.message_id and public.is_conversation_member(m.conversation_id)));
create policy "Users remove own message reactions" on public.message_reactions for delete to authenticated
using (user_id=(select auth.uid()));
do $$ begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; when undefined_object then null; end $$;