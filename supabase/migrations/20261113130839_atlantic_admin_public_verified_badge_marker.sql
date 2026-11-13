CREATE OR REPLACE FUNCTION public.enforce_admin_only_profile_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated') THEN
    NEW.is_verified := EXISTS (
      SELECT 1 FROM public.atlantic_admins a WHERE a.user_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.profiles p
   SET is_verified = EXISTS (
     SELECT 1 FROM public.atlantic_admins a WHERE a.user_id = p.id
   )
 WHERE p.is_verified IS DISTINCT FROM EXISTS (
     SELECT 1 FROM public.atlantic_admins a WHERE a.user_id = p.id
   );
