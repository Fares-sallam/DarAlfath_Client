-- ══════════════════════════════════════════════════════════════════════════
-- نفس فئة خلل orders/order_items/audit_logs/coupons المُصلَحة سابقًا
-- (20260711_fix_orders_auditlogs_rls_staff_access.sql وما قبلها): product_inventory
-- عنده سياسة authenticated مفتوحة بالكامل (qual: true) — أي مستخدم مسجّل دخول
-- (عميل عادي، مش بس أدمن) يقرأ المخزون الداخلي. products/product_variants عندهم
-- سياسات public_read_*/anon_select مفتوحة لـanon+authenticated مباشرة على
-- الجداول الخام — تكشف عمود cost_price. اكتُشفت أثناء مراجعة أمنية حية
-- (2026-07-31) بمحاكاة SET LOCAL ROLE authenticated لحساب عميل حقيقي غير-أدمن.
--
-- المتجر لا يتأثر: يستخدم حصرًا products_public_catalog/product_variants_public
-- (views مملوكة لـpostgres، تتجاوز RLS، لا تُظهر cost_price — تحقّق من تعريفهما
-- وdgruth الاستخدام في src/hooks/useStorefront.ts). لوحة التحكم تستخدم
-- product_inventory مباشرة (useInventory.ts) لكن فقط من جلسة أدمن — is_admin()
-- يغطّيها تمامًا.
-- ══════════════════════════════════════════════════════════════════════════

-- ── product_inventory ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_full_product_inventory" ON public.product_inventory;
DROP POLICY IF EXISTS "inventory_admin_all"           ON public.product_inventory;
DROP POLICY IF EXISTS "inventory_auth_select"         ON public.product_inventory;

CREATE POLICY "isadmin_full_product_inventory" ON public.product_inventory
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── products ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_full_products"   ON public.products;
DROP POLICY IF EXISTS "products_admin_delete" ON public.products;
DROP POLICY IF EXISTS "products_admin_insert" ON public.products;
DROP POLICY IF EXISTS "products_admin_select" ON public.products;
DROP POLICY IF EXISTS "products_admin_update" ON public.products;
DROP POLICY IF EXISTS "public_read_products"  ON public.products;

CREATE POLICY "isadmin_full_products" ON public.products
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── product_variants ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_full_product_variants" ON public.product_variants;
DROP POLICY IF EXISTS "variants_admin_all"           ON public.product_variants;
DROP POLICY IF EXISTS "public_read_product_variants" ON public.product_variants;
DROP POLICY IF EXISTS "variants_anon_select"         ON public.product_variants;
DROP POLICY IF EXISTS "variants_auth_select"         ON public.product_variants;

CREATE POLICY "isadmin_full_product_variants" ON public.product_variants
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── تنظيف صلاحيات كتابة خاملة على الـviews العامة (نفس منطق
--    inventory_dashboard_view سابقًا) — views غير قابلة للتحديث أصلًا
--    (join متعدد الجداول) فهذا تنظيف احترازي، لا أثر وظيفي ──
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.products_public_catalog
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.product_variants_public
  FROM anon, authenticated;
