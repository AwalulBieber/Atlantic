-- Keep trigger/event-trigger functions out of the exposed RPC surface.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_primary_atlantic_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Authorization helpers may be called by signed-in clients, never anonymous clients.
REVOKE EXECUTE ON FUNCTION public.is_atlantic_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_atlantic_admin(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;

-- Verification review is authenticated-only; the function itself enforces admin status.
REVOKE EXECUTE ON FUNCTION public.review_atlantic_verification_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_atlantic_verification_request(uuid, boolean, text) TO authenticated;
