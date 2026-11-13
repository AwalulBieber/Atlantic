-- Allow a signed-in user to register or restore only their own public E2EE key.
-- The existing Users update own profile policy restricts the row to auth.uid().
grant update (e2ee_public_key) on table public.profiles to authenticated;
