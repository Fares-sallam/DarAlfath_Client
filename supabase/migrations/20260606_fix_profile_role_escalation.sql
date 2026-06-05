-- ══════════════════════════════════════════════════════════════════════════
-- إصلاح حرج: منع تصعيد الصلاحيات عبر profiles.role
--
-- المشكلة المؤكّدة: سياسات تعديل profiles تتحقق من ملكية الصف (id = auth.uid())
-- فقط، فأي مستخدم مسجّل (حتى عميل عادي) كان يقدر:
--     UPDATE profiles SET role = 'super_admin' WHERE id = auth.uid();
-- ويصبح super_admin (get_my_role() يقرأ profiles.role) → وصول كامل للطلبات وغيرها.
--
-- الحل: trigger يمنع تغيير الأعمدة الحسّاسة (role / is_active / country_id)
-- إلا من:
--   • أدوار النظام (service_role / postgres) — أي Edge Functions والـ migrations.
--   • مشرف يملك صلاحية إدارة المشرفين (can_manage_admins()).
-- التعديلات العادية (الاسم، الهاتف، الصورة) تبقى متاحة للمستخدم على صفّه.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER                 -- نحتاج رؤية الدور المنفِّذ الحقيقي (current_user)
SET search_path = public
AS $$
BEGIN
  -- أدوار النظام الداخلية (Edge Functions عبر service_role، الـ migrations) تتجاوز.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- المشرف الذي يملك إدارة المشرفين مسموح له بكل شيء.
  IF public.can_manage_admins() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- منع تغيير الأعمدة الحسّاسة على صفّه أو صف غيره.
    IF (
          NEW.role       IS DISTINCT FROM OLD.role
       OR NEW.is_active  IS DISTINCT FROM OLD.is_active
       OR NEW.country_id IS DISTINCT FROM OLD.country_id
       )
    THEN
      RAISE EXCEPTION 'غير مصرح بتعديل الدور أو الحالة أو الدولة';
    END IF;

  ELSIF TG_OP = 'INSERT' THEN
    -- عند إنشاء صفّه، لا يُسمح إلا بدور مستخدم عادي (يمنع إدراج super_admin
    -- لمن لا يملك صف profile أصلًا).
    IF NEW.role IS NOT NULL AND NEW.role IS DISTINCT FROM 'user' THEN
      RAISE EXCEPTION 'غير مصرح بتعيين دور مميّز عند إنشاء الحساب';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileges();
