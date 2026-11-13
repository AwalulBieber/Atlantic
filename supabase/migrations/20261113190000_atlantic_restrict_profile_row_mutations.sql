-- Profile rows are created by the trusted auth trigger and should not be
-- inserted or deleted directly through the authenticated Data API.
revoke insert, delete on table public.profiles from anon, authenticated;
