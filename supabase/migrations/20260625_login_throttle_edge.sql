-- ══════════════════════════════════════════════════════════════════════════
-- دوال قفل الدخول عبر Edge Function (secure-login) — تعيد استخدام auth_login_throttle.
-- ══════════════════════════════════════════════════════════════════════════

-- تحديد user_id من الإيميل (service_role فقط — لمنع تعداد الإيميلات).
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = auth, public AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;

-- حالة القفل الحالية.
CREATE OR REPLACE FUNCTION public.login_throttle_status(p_user_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN locked_until IS NOT NULL AND locked_until > now()
      THEN jsonb_build_object('locked', true, 'secs_left', ceil(extract(epoch from (locked_until - now())))::int)
      ELSE jsonb_build_object('locked', false)
  END
  FROM public.auth_login_throttle WHERE user_id = p_user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.login_throttle_status(uuid) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.login_throttle_status(uuid) TO service_role;

-- تسجيل نتيجة محاولة (ذرّي): نجاح يصفّر، فشل يزيد ويقفل عند 5.
CREATE OR REPLACE FUNCTION public.record_login_result(p_user_id uuid, p_success boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec  public.auth_login_throttle%ROWTYPE;
  v_now  timestamptz := now();
  v_max  int := 5;
  v_lock int := 2;
BEGIN
  SELECT * INTO v_rec FROM public.auth_login_throttle WHERE user_id = p_user_id FOR UPDATE;

  IF p_success THEN
    IF v_rec.user_id IS NOT NULL THEN DELETE FROM public.auth_login_throttle WHERE user_id = p_user_id; END IF;
    RETURN jsonb_build_object('locked', false);
  END IF;

  IF v_rec.user_id IS NULL THEN
    INSERT INTO public.auth_login_throttle(user_id, failed_count, last_failed_at) VALUES (p_user_id, 1, v_now);
    RETURN jsonb_build_object('locked', false, 'remaining', v_max - 1);
  END IF;

  IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until <= v_now THEN
    UPDATE public.auth_login_throttle SET failed_count = 1, locked_until = NULL, last_failed_at = v_now WHERE user_id = p_user_id;
    RETURN jsonb_build_object('locked', false, 'remaining', v_max - 1);
  END IF;

  UPDATE public.auth_login_throttle SET failed_count = v_rec.failed_count + 1, last_failed_at = v_now WHERE user_id = p_user_id;

  IF v_rec.failed_count + 1 >= v_max THEN
    UPDATE public.auth_login_throttle SET locked_until = v_now + make_interval(mins => v_lock) WHERE user_id = p_user_id;
    RETURN jsonb_build_object('locked', true, 'secs_left', v_lock * 60);
  END IF;

  RETURN jsonb_build_object('locked', false, 'remaining', v_max - (v_rec.failed_count + 1));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_login_result(uuid, boolean) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.record_login_result(uuid, boolean) TO service_role;
