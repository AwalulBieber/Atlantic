alter table public.messages add column if not exists e2ee_key_id uuid;
alter table public.atlantic_polls add column if not exists e2ee_key_id uuid;

create table if not exists public.conversation_e2ee_key_epochs (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  key_id uuid not null,
  shares jsonb not null,
  member_ids uuid[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id,key_id),
  constraint conversation_e2ee_key_epochs_shares_object check (jsonb_typeof(shares)='object')
);
alter table public.conversation_e2ee_key_epochs enable row level security;
drop policy if exists "Members read E2EE key epochs" on public.conversation_e2ee_key_epochs;
create policy "Members read E2EE key epochs"
on public.conversation_e2ee_key_epochs for select to authenticated
using (public.is_conversation_member(conversation_id));
drop policy if exists "Members create E2EE key epochs" on public.conversation_e2ee_key_epochs;
create policy "Members create E2EE key epochs"
on public.conversation_e2ee_key_epochs for insert to authenticated
with check (created_by=(select auth.uid()) and public.is_conversation_member(conversation_id));
grant select,insert on public.conversation_e2ee_key_epochs to authenticated;
grant update (e2ee_key_id) on public.messages to authenticated;
grant update (e2ee_key_id) on public.atlantic_polls to authenticated;