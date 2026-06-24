-- ══════════════════════════════════════════════════════════════════════════
-- تحصين إضافي: audit_logs + coupons
-- ══════════════════════════════════════════════════════════════════════════

-- 0) is_admin() self-contained — حتى لا تعتمد السياسات على دالة خارجية قد تكون
--    غير موجودة. الأدمن عبر profiles.role (نفس مصدر get_my_role على live).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY (ARRAY['super_admin', 'admin', 'manager'])
  );
$$;

-- 1) audit_logs: قصر الإدراج على الموظفين (يمنع العميل من تزوير سجلات).
--    triggers التدقيق SECURITY DEFINER تتخطّى RLS، فالتسجيل التلقائي يفضل شغّال.
DROP POLICY IF EXISTS "audit_insert_all"   ON public.audit_logs;
DROP POLICY IF EXISTS "audit_insert_staff" ON public.audit_logs;
CREATE POLICY "audit_insert_staff" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- 2) coupons: إزالة القراءة المباشرة للعميل/الزائر. المتجر الآن يتحقق من الكوبون
--    عبر Edge Function (validate-coupon, service_role)، فلم يعد العميل يحتاج قراءة
--    الجدول — وبالتالي يُغلق تعداد أكواد الخصم. سياسات الأدمن/المالك تبقى كما هي.
DROP POLICY IF EXISTS "coupons_auth_select"        ON public.coupons;
DROP POLICY IF EXISTS "public_read_active_coupons" ON public.coupons;
DROP POLICY IF EXISTS "storefront_read_coupons"    ON public.coupons;
