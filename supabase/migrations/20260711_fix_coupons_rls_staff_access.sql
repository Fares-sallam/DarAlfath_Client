-- ══════════════════════════════════════════════════════════════════════════
-- إصلاح RLS على coupons: السياسات القديمة تسمح فقط لإيميل المالك أو لمن كان
-- profiles.role ضمن قائمة محدّدة — لا تشمل موظفي admin_settings (نموذج
-- الصلاحيات الحبيبية can_manage_coupons المستخدم في باقي لوحة التحكم). أي
-- موظف يُضاف بصلاحية "إدارة الكوبونات" دون ضبط profiles.role يدويًا لن يرى
-- أي كوبون إطلاقًا. نوحّدها على is_admin() (تشمل: إيميل المالك، أو
-- profiles.role إداري، أو وجود صف admin_settings) — تطابق باقي الجداول
-- المُصلَحة سابقًا هذه الجلسة (admin_settings/product_prices/notifications).
-- ══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admin_full_coupons" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_all"  ON public.coupons;

CREATE POLICY "isadmin_full_coupons" ON public.coupons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
