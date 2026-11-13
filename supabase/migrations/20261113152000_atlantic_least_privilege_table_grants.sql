-- Remove API-role privileges that bypass row-level policy checks or are
-- unnecessary for browser clients. Preserve ordinary DML only where RLS governs it.
revoke all privileges on all tables in schema public from anon;

revoke truncate, references, trigger, maintain
  on all tables in schema public
  from anon, authenticated, public;

-- E2EE envelopes are client-readable and initially insertable only.
-- Rotation and epoch writes must go through the validated SECURITY DEFINER RPCs.
revoke all privileges on table public.conversation_e2ee_keys from anon, authenticated, public;
grant select, insert on table public.conversation_e2ee_keys to authenticated;

revoke all privileges on table public.conversation_e2ee_key_epochs from anon, authenticated, public;
grant select, insert on table public.conversation_e2ee_key_epochs to authenticated;
