CREATE OR REPLACE FUNCTION public.protect_account_moderation_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_atlantic_admin(auth.uid()) THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
       OR NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
       OR NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason THEN
      RAISE EXCEPTION 'Status verifikasi dan blokir hanya dapat diubah oleh admin Atlantic';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_admin_only_profile_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_verified := false;
    ELSE
      NEW.is_verified := OLD.is_verified;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_lock_user_verified_badge ON public.profiles;
CREATE TRIGGER profiles_lock_user_verified_badge
BEFORE INSERT OR UPDATE OF is_verified ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_only_profile_verification();

CREATE OR REPLACE FUNCTION public.review_atlantic_verification_request(request_id uuid, approve boolean, admin_note text DEFAULT ''::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  target_user uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_atlantic_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Hanya admin Atlantic yang dapat meninjau pengajuan.';
  END IF;
  SELECT user_id INTO target_user
    FROM public.atlantic_verification_requests
    WHERE id = request_id AND status = 'pending'
    FOR UPDATE;
  IF target_user IS NULL THEN
    RAISE EXCEPTION 'Pengajuan tidak ditemukan atau sudah ditinjau.';
  END IF;
  UPDATE public.atlantic_verification_requests
    SET status = CASE WHEN approve THEN 'approved' ELSE 'rejected' END,
        reviewed_at = now(), reviewed_by = auth.uid(),
        review_note = left(coalesce(admin_note,''),500)
    WHERE id = request_id;
  UPDATE public.profiles SET is_verified = false WHERE id = target_user;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_verified(target_user uuid, should_verify boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_atlantic_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Hanya admin Atlantic yang dapat mengubah status verifikasi.';
  END IF;
  IF public.is_atlantic_admin(target_user) THEN
    RAISE EXCEPTION 'Status verifikasi admin utama ditentukan oleh peran admin.';
  END IF;
  IF should_verify THEN
    RAISE EXCEPTION 'Atlantic Verified hanya diberikan otomatis kepada Admin Atlantic utama.';
  END IF;
  UPDATE public.profiles SET is_verified = false WHERE id = target_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengguna tidak ditemukan'; END IF;
  RETURN true;
END;
$$;

UPDATE public.profiles SET is_verified = false WHERE is_verified IS DISTINCT FROM false;
