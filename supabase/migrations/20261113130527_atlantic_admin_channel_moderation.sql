CREATE OR REPLACE FUNCTION public.admin_list_channels()
RETURNS TABLE (
  channel_id uuid,
  channel_name text,
  channel_description text,
  is_public boolean,
  created_at timestamptz,
  owner_id uuid,
  member_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_atlantic_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Atlantic admin access required';
  END IF;
  RETURN QUERY
    SELECT c.id, c.name, c.description, c.is_public, c.created_at, c.owner_id,
           count(m.user_id)::bigint
      FROM public.atlantic_channels c
      LEFT JOIN public.atlantic_channel_members m ON m.channel_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_channel_visibility(target_channel uuid, should_publish boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_atlantic_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Atlantic admin access required';
  END IF;
  UPDATE public.atlantic_channels
     SET is_public = should_publish
   WHERE id = target_channel;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saluran tidak ditemukan';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_channels() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_channel_visibility(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_channels() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_channel_visibility(uuid, boolean) TO authenticated;
