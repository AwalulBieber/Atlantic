-- Replace broad table SELECT with explicit public/profile-safe columns.
-- Moderation columns are exposed only through authenticated, scoped RPCs.
revoke select on table public.profiles from anon, authenticated;
grant select (
  id,
  username,
  display_name,
  avatar_url,
  created_at,
  bio,
  last_seen_at,
  is_private,
  show_online_status,
  read_receipts_enabled,
  group_invite_policy,
  is_verified,
  e2ee_public_key
) on table public.profiles to authenticated;
revoke select (is_blocked, blocked_reason), insert (is_blocked, blocked_reason)
  on table public.profiles from authenticated;
