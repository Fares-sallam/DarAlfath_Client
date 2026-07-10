-- ══════════════════════════════════════════════════════════════════════════
-- نفس فئة خلل coupons: سياسات الأدمن على orders/order_items/audit_logs تفحص
-- إيميل المالك أو profiles.role فقط — لا تشمل موظفي admin_settings. أي موظف
-- يُمنح "إدارة الطلبات" أو "عرض سجل النشاط" من لوحة "إعدادات المشرفين" دون
-- ضبط profiles.role يدويًا لا يرى أي طلب أو سجل إطلاقًا. تم اكتشافها بمحاكاة
-- دقيقة (SET LOCAL ROLE authenticated) لحساب موظف اختبار حقيقي — orders (3
-- صفوف) وorder_items (3) وaudit_logs (1982) كانت تُرجع صفرًا لهذا الحساب رغم
-- امتلاكه صلاحية admin_settings الصريحة.
-- لا تُمسّ سياسات "العميل يقرأ طلباته الخاصة" — منفصلة تمامًا وسليمة.
-- ══════════════════════════════════════════════════════════════════════════

-- ── orders ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_full_orders"   ON public.orders;
DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_delete" ON public.orders;

CREATE POLICY "isadmin_full_orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── order_items ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_full_order_items"   ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_all"    ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_select" ON public.order_items;

CREATE POLICY "isadmin_full_order_items" ON public.order_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── audit_logs (قراءة فقط للأدمن — الإدراج يبقى عبر audit_insert_staff/triggers) ──
DROP POLICY IF EXISTS "admin_full_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_admin_select"    ON public.audit_logs;

CREATE POLICY "isadmin_select_audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());
