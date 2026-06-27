-- ══════════════════════════════════════════════════════════════════════════
-- قفل تسجيل الدخول: بعد 5 محاولات كلمة سر فاشلة → قفل الحساب دقيقتين.
-- يُنفَّذ عبر Supabase Auth Hook (Password Verification Attempt) داخل سيرفر
-- المصادقة، فيغطّي صفحة العميل ولوحة التحكم معًا ولا يمكن تخطّيه بنداء API مباشر.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.auth_login_throttle (
  user_id        uuid PRIMARY KEY,
  failed_count   int NOT NULL DEFAULT 0,
  locked_until   timestamptz,
  last_failed_at timestamptz NOT NULL DEFAULT now()
);
-- جدول داخلي: لا وصول لـ anon/authenticated (الدالة SECURITY DEFINER تتجاوز RLS).
ALTER TABLE public.auth_login_throttle ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.password_verification_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_valid   boolean;
  v_now     timestamptz := now();
  v_rec     public.auth_login_throttle%ROWTYPE;
  v_max     int := 5;   -- عدد المحاولات الفاشلة قبل القفل
  v_lockmin int := 2;   -- مدة القفل بالدقائق
BEGIN
  v_user_id := (event->>'user_id')::uuid;
  v_valid   := COALESCE((event->>'valid')::boolean, true);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('decision','continue');
  END IF;

  SELECT * INTO v_rec FROM public.auth_login_throttle WHERE user_id = v_user_id FOR UPDATE;

  -- مقفول حاليًا والمدة لم تنتهِ → ارفض حتى لو كلمة السر صحيحة.
  IF v_rec.user_id IS NOT NULL AND v_rec.locked_until IS NOT NULL AND v_rec.locked_until > v_now THEN
    RETURN jsonb_build_object('decision','reject',
      'message','تم قفل الحساب مؤقتًا بسبب محاولات دخول كثيرة. حاول بعد دقيقتين.');
  END IF;

  IF v_valid THEN
    -- كلمة سر صحيحة وغير مقفول → صفّر العدّاد واسمح.
    IF v_rec.user_id IS NOT NULL THEN
      DELETE FROM public.auth_login_throttle WHERE user_id = v_user_id;
    END IF;
    RETURN jsonb_build_object('decision','continue');
  END IF;

  -- كلمة سر خاطئة:
  IF v_rec.user_id IS NULL THEN
    INSERT INTO public.auth_login_throttle(user_id, failed_count, last_failed_at)
    VALUES (v_user_id, 1, v_now);
    RETURN jsonb_build_object('decision','continue');
  END IF;

  -- انتهى قفل سابق → ابدأ العدّ من جديد.
  IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until <= v_now THEN
    UPDATE public.auth_login_throttle
       SET failed_count = 1, locked_until = NULL, last_failed_at = v_now
     WHERE user_id = v_user_id;
    RETURN jsonb_build_object('decision','continue');
  END IF;

  UPDATE public.auth_login_throttle
     SET failed_count = v_rec.failed_count + 1, last_failed_at = v_now
   WHERE user_id = v_user_id;

  IF v_rec.failed_count + 1 >= v_max THEN
    UPDATE public.auth_login_throttle
       SET locked_until = v_now + make_interval(mins => v_lockmin)
     WHERE user_id = v_user_id;
    RETURN jsonb_build_object('decision','reject',
      'message','تم قفل الحساب لمدة دقيقتين بعد 5 محاولات فاشلة.');
  END IF;

  RETURN jsonb_build_object('decision','continue');
EXCEPTION WHEN OTHERS THEN
  -- fail-open: أي خطأ غير متوقع لا يجب أن يمنع الدخول الشرعي.
  RETURN jsonb_build_object('decision','continue');
END;
$$;

-- صلاحيات الـhook لسيرفر المصادقة فقط.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.password_verification_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.password_verification_hook(jsonb) FROM anon, authenticated, public;
