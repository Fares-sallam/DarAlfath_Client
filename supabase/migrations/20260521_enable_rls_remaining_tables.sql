-- ══════════════════════════════════════════════════════════════════════════
-- إصلاح أمني (الجزء 2): الجداول المتبقية بدون RLS
--
-- الجداول:
--   ● categories                      → كتالوج — قراءة عامة
--   ● book_series                     → كتالوج — قراءة عامة
--   ● product_series                  → كتالوج — قراءة عامة
--   ● product_country_prices          → كتالوج/أسعار — قراءة عامة
--   ● product_variant_country_prices  → كتالوج/أسعار — قراءة عامة
--   ● electronic_books                → محتوى رقمي — قراءة عامة
--   ● audit_logs                      → سجل إداري — ⛔ لا وصول للعميل
--
-- ملاحظة: بعض هذه الجداول قد تُستخدم داخل الـ Views
--         (products_public_catalog, product_variants_public)
--         لذلك يجب أن تسمح بالقراءة العامة حتى لا تنكسر الواجهة.
-- ══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════
-- الخطوة 1: تفعيل RLS
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS public.categories                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.book_series                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_series                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_country_prices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_variant_country_prices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.electronic_books                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs                      ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════
-- الخطوة 2: سياسات القراءة العامة (كتالوج + أسعار)
-- ══════════════════════════════════════════════════════════════════════════

-- ── categories ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_categories" ON public.categories;
CREATE POLICY "public_read_categories" ON public.categories
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── book_series ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_book_series" ON public.book_series;
CREATE POLICY "public_read_book_series" ON public.book_series
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── product_series ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_product_series" ON public.product_series;
CREATE POLICY "public_read_product_series" ON public.product_series
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── product_country_prices ───────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_product_country_prices" ON public.product_country_prices;
CREATE POLICY "public_read_product_country_prices" ON public.product_country_prices
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── product_variant_country_prices ───────────────────────────────────────
DROP POLICY IF EXISTS "public_read_variant_country_prices" ON public.product_variant_country_prices;
CREATE POLICY "public_read_variant_country_prices" ON public.product_variant_country_prices
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── electronic_books ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_electronic_books" ON public.electronic_books;
CREATE POLICY "public_read_electronic_books" ON public.electronic_books
  FOR SELECT TO anon, authenticated
  USING (true);


-- ══════════════════════════════════════════════════════════════════════════
-- الخطوة 3: audit_logs — ⛔ لا وصول للعميل إطلاقاً
--           (لا سياسات = لا أحد يقرأ إلا service_role)
-- ══════════════════════════════════════════════════════════════════════════

-- لا حاجة لإضافة سياسة — تفعيل RLS بدون سياسات = حظر كامل على العميل
-- service_role يتخطى RLS تلقائياً


-- ══════════════════════════════════════════════════════════════════════════
-- تأكيد نهائي: شغّل بعد التنفيذ
-- ══════════════════════════════════════════════════════════════════════════
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND NOT rowsecurity
-- ORDER BY tablename;
-- ← لو النتيجة فاضية = ✅ كل الجداول متأمّنة
