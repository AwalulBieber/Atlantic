alter table public.conversation_e2ee_keys
  add column if not exists member_ids uuid[] not null default '{}';

drop policy if exists "Key creator rotates conversation E2EE key envelopes" on public.conversation_e2ee_keys;
drop policy if exists "Members rotate conversation E2EE key envelopes" on public.conversation_e2ee_keys;
create policy "Current members rotate conversation E2EE key envelopes"
on public.conversation_e2ee_keys
for update
to authenticated
using (public.is_conversation_member(conversation_id))
with check (public.is_conversation_member(conversation_id));