-- Atlantic end-to-end encryption key storage.
-- Public identity keys are safe to publish; private keys never leave user devices.
alter table public.profiles
  add column if not exists e2ee_public_key jsonb;

create table if not exists public.conversation_e2ee_keys (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  key_id uuid not null,
  shares jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_e2ee_keys_shares_object check (jsonb_typeof(shares) = 'object')
);

alter table public.conversation_e2ee_keys enable row level security;

drop policy if exists "Members read conversation E2EE key envelopes" on public.conversation_e2ee_keys;
create policy "Members read conversation E2EE key envelopes"
on public.conversation_e2ee_keys for select to authenticated
using (public.is_conversation_member(conversation_id));

drop policy if exists "Members create conversation E2EE key envelopes" on public.conversation_e2ee_keys;
create policy "Members create conversation E2EE key envelopes"
on public.conversation_e2ee_keys for insert to authenticated
with check (created_by = (select auth.uid()) and public.is_conversation_member(conversation_id));

drop policy if exists "Members rotate conversation E2EE key envelopes" on public.conversation_e2ee_keys;
create policy "Members rotate conversation E2EE key envelopes"
on public.conversation_e2ee_keys for update to authenticated
using (public.is_conversation_member(conversation_id))
with check (public.is_conversation_member(conversation_id));

grant select, insert, update on public.conversation_e2ee_keys to authenticated;
