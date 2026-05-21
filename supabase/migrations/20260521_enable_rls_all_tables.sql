-- ══════════════════════════════════════════════════════════════════════════
-- إصلاح أمني: تفعيل Row-Level Security (RLS) على جميع الجداول
--
-- المشكلة: Supabase أرسل تحذير أمني (CRITICAL) بأن جداول في public schema
--          ليس عليها RLS، مما يسمح لأي شخص بقراءة/تعديل/حذف البيانات.
--
-- الحل:
--   1. تفعيل RLS على كل الجداول
--   2. إضافة سياسات (Policies) مناسبة لكل جدول:
--      - الكتالوج (منتجات، صور، دول...): قراءة عامة فقط
--      - الطلبات: المستخدم يرى طلباته فقط
--      - الكوبونات: قراءة النشطة فقط
--      - المخزون: لا وصول للعميل (فقط service_role)
--
-- ملاحظة: service_role (المستخدم بواسطة Edge Functions) يتخطى RLS تلقائياً
--          لذلك كل الـ Edge Functions ستعمل بدون أي تغيير.
-- ══════════════════════════════════════════════════════════════════════════


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  تشخيص: اعرض الجداول اللي مفيش عليها RLS (شغّلها لوحدها لو حبيت)  ║
-- ╚════════════════════════════════════════════════════════════════════════╝
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;


-- ══════════════════════════════════════════════════════════════════════════
-- الخطوة 1: تفعيل RLS على جميع الجداول
-- ══════════════════════════════════════════════════════════════════════════

-- ── جداول الكتالوج (قراءة عامة) ──
ALTER TABLE IF EXISTS public.products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_variants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_images      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.countries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_methods     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shipping_companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coupons             ENABLE ROW LEVEL SECURITY;

-- ── جداول المستخدمين ──
ALTER TABLE IF EXISTS public.orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles            ENABLE ROW LEVEL SECURITY;

-- ── جداول الباك إند فقط ──
ALTER TABLE IF EXISTS public.product_inventory   ENABLE ROW LEVEL SECURITY;
-- pending_payments: RLS مفعّل أصلاً (من migration سابق)


-- ══════════════════════════════════════════════════════════════════════════
-- الخطوة 2: سياسات الكتالوج — قراءة عامة (anon + authenticated)
--           الكتابة ممنوعة على العميل — فقط service_role يكتب
-- ══════════════════════════════════════════════════════════════════════════

-- ── products ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_products" ON public.products;
CREATE POLICY "public_read_products" ON public.products
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── product_variants ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_product_variants" ON public.product_variants;
CREATE POLICY "public_read_product_variants" ON public.product_variants
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── product_images ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_product_images" ON public.product_images;
CREATE POLICY "public_read_product_images" ON public.product_images
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── countries ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_countries" ON public.countries;
CREATE POLICY "public_read_countries" ON public.countries
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── payment_methods ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_payment_methods" ON public.payment_methods;
CREATE POLICY "public_read_payment_methods" ON public.payment_methods
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── store_settings ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_store_settings" ON public.store_settings;
CREATE POLICY "public_read_store_settings" ON public.store_settings
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── shipping_companies ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_shipping_companies" ON public.shipping_companies;
CREATE POLICY "public_read_shipping_companies" ON public.shipping_companies
  FOR SELECT TO anon, authenticated
  USING (true);


-- ══════════════════════════════════════════════════════════════════════════
-- الخطوة 3: سياسة الكوبونات — قراءة النشطة فقط
--           لا يمكن للعميل رؤية كوبونات معطلة أو منتهية
-- ══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "public_read_active_coupons" ON public.coupons;
CREATE POLICY "public_read_active_coupons" ON public.coupons
  FOR SELECT TO anon, authenticated
  USING (is_active = true);


-- ══════════════════════════════════════════════════════════════════════════
-- الخطوة 4: سياسات الطلبات — المستخدم يرى طلباته فقط
-- ══════════════════════════════════════════════════════════════════════════

-- ── orders ────────────────────────────────────────────────────────────────
-- المستخدم المسجّل يرى طلباته + طلبات الضيف اللي بنفس إيميله
DROP POLICY IF EXISTS "users_read_own_orders" ON public.orders;
CREATE POLICY "users_read_own_orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      user_id IS NULL
      AND shipping_address->>'email' = auth.jwt()->>'email'
    )
  );

-- ── order_items ──────────────────────────────────────────────────────────
-- المستخدم يرى عناصر طلباته فقط (من خلال JOIN مع orders)
DROP POLICY IF EXISTS "users_read_own_order_items" ON public.order_items;
CREATE POLICY "users_read_own_order_items" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          o.user_id = auth.uid()
          OR (
            o.user_id IS NULL
            AND o.shipping_address->>'email' = auth.jwt()->>'email'
          )
        )
    )
  );


-- ══════════════════════════════════════════════════════════════════════════
-- الخطوة 5: سياسات البروفايل — المستخدم يدير بروفايله فقط
-- ══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
CREATE POLICY "users_insert_own_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════
-- الخطوة 6: المخزون — لا وصول للعميل إطلاقاً
--           service_role يتخطى RLS — فالـ triggers والـ RPCs تشتغل عادي
-- ══════════════════════════════════════════════════════════════════════════

-- product_inventory: لا سياسات = لا وصول للعميل
-- (service_role يتخطى RLS تلقائياً)


-- ══════════════════════════════════════════════════════════════════════════
-- الخطوة 7: شبكة أمان — لو فيه جداول تانية منسية
--           شغّل الاستعلام ده بعد تنفيذ الكود فوق للتأكد
-- ══════════════════════════════════════════════════════════════════════════

-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND NOT rowsecurity
-- ORDER BY tablename;
