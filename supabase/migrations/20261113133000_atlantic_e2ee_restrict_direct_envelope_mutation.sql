drop policy if exists "Current members rotate conversation E2EE key envelopes" on public.conversation_e2ee_keys;
revoke update on public.conversation_e2ee_keys from authenticated;