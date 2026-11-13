-- Restrict envelope updates to the account that initialized the conversation key.
-- This prevents arbitrary conversation members from replacing every recipient's
-- wrapped key with attacker-chosen envelopes.
drop policy if exists "Members rotate conversation E2EE key envelopes" on public.conversation_e2ee_keys;
drop policy if exists "Key creator rotates conversation E2EE key envelopes" on public.conversation_e2ee_keys;
create policy "Key creator rotates conversation E2EE key envelopes"
on public.conversation_e2ee_keys
for update
to authenticated
using (created_by = (select auth.uid()) and public.is_conversation_member(conversation_id))
with check (created_by = (select auth.uid()) and public.is_conversation_member(conversation_id));