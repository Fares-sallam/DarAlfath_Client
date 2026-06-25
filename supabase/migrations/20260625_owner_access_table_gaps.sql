-- ══════════════════════════════════════════════════════════════════════════
-- سدّ فجوات وصول المالك على جداول لوحة التحكم.
-- المالك (faresalsaid780@gmail.com) دوره profiles.role='user' ومُعرَّف بالإيميل،
-- وهذه الجداول كانت سياساتها بالدور/is_active_admin فقط → ترفض المالك.
-- ══════════════════════════════════════════════════════════════════════════

-- admin_settings: المالك يدير المشرفين — بالإيميل فقط (نحافظ على can_manage_admins
-- للبقية، ونتجنّب is_admin هنا لمنع أي تكرار ذاتي مع قراءته لـ admin_settings).
DROP POLICY IF EXISTS "owner_full_admin_settings" ON public.admin_settings;
CREATE POLICY "owner_full_admin_settings" ON public.admin_settings
  FOR ALL TO authenticated
  USING      (COALESCE((auth.jwt() ->> 'email') = 'faresalsaid780@gmail.com', false))
  WITH CHECK (COALESCE((auth.jwt() ->> 'email') = 'faresalsaid780@gmail.com', false));

-- product_prices / notifications / ebook_purchases: وصول إداري عبر is_admin().
DROP POLICY IF EXISTS "isadmin_full_product_prices" ON public.product_prices;
CREATE POLICY "isadmin_full_product_prices" ON public.product_prices
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "isadmin_full_notifications" ON public.notifications;
CREATE POLICY "isadmin_full_notifications" ON public.notifications
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "isadmin_full_ebook_purchases" ON public.ebook_purchases;
CREATE POLICY "isadmin_full_ebook_purchases" ON public.ebook_purchases
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
