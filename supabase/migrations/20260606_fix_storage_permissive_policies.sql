-- ══════════════════════════════════════════════════════════════════════════
-- إصلاح حرج: سياسات تخزين متساهلة تتخطّى الحماية المقصودة
--
-- المشكلة: بجانب سياسات الأدمن السليمة (role IN super_admin/admin/manager)
-- وسياسة المشتري (buyer_select_ebooks)، كانت توجد سياسات "auth_*" /
-- "authenticated ..." تمنح *أي مستخدم مسجّل* (أي عميل) صلاحيات واسعة.
-- وبما أن سياسات RLS متساهلة (OR)، كانت تتخطّى كل القيود:
--   • auth_read_ebooks → أي عميل يقرأ/يحمّل كل الكتب الرقمية المدفوعة مجانًا.
--   • auth_upload/update/delete_* → أي عميل يحذف/يستبدل أغلفة الكتب وصور
--     المنتجات والكتب الرقمية (تخريب وتدمير محتوى).
--
-- الحل: إسقاط هذه السياسات المتساهلة فقط. تبقى:
--   • سياسات الأدمن المعتمدة على الدور (للرفع/التعديل/الحذف).
--   • buyer_select_ebooks (المشتري يقرأ كتابه ضمن صلاحية التوكن).
--   • القراءة العامة لِـ book-covers و product-images (bucket عام أصلًا).
-- ══════════════════════════════════════════════════════════════════════════

-- ── ebooks (الأخطر: قراءة الكتب الرقمية الخاصة) ──────────────────────────
DROP POLICY IF EXISTS "auth_read_ebooks"        ON storage.objects;
DROP POLICY IF EXISTS "auth_upload_ebooks"      ON storage.objects;
DROP POLICY IF EXISTS "auth_update_ebooks"      ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_ebooks"      ON storage.objects;

-- ── book-covers (كتابة/حذف عامة) ─────────────────────────────────────────
DROP POLICY IF EXISTS "auth_upload_book_covers"               ON storage.objects;
DROP POLICY IF EXISTS "authenticated can upload to book-covers" ON storage.objects;
DROP POLICY IF EXISTS "auth_update_book_covers"               ON storage.objects;
DROP POLICY IF EXISTS "authenticated can update book-covers"   ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_book_covers"               ON storage.objects;
DROP POLICY IF EXISTS "authenticated can delete book-covers"   ON storage.objects;

-- ── product-images (كتابة/حذف عامة) ──────────────────────────────────────
DROP POLICY IF EXISTS "auth_upload_product_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_update_product_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_product_images" ON storage.objects;

-- ══════════════════════════════════════════════════════════════════════════
-- نفس الخلل على جدول public.product_images (بيانات الصور، وليس الملفات):
-- سياسات "true" كانت تسمح لأي عميل بحقن/تعديل/حذف صور أي منتج.
-- تبقى الحماية عبر product_images_admin_all (الأدوار) وسياسة المالك.
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "auth_insert_product_images" ON public.product_images;
DROP POLICY IF EXISTS "auth_update_product_images" ON public.product_images;
DROP POLICY IF EXISTS "auth_delete_product_images" ON public.product_images;
