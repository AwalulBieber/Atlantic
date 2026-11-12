-- Prevent users from self-assigning the verified badge through profiles.update().
revoke update on table public.profiles from authenticated;
grant update (username, display_name, avatar_url, bio, is_private, show_online_status, read_receipts_enabled, group_invite_policy)
  on table public.profiles to authenticated;
