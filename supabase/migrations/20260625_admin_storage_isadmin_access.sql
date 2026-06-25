-- ══════════════════════════════════════════════════════════════════════════
-- وصول الأدمن للتخزين عبر is_admin() (يشمل المالك المُعرَّف بالإيميل)
-- سياسات الرفع/التعديل/الحذف القائمة تعتمد على profiles.role أو is_active_admin،
-- وكلاهما يرفض المالك (role='user') → "new row violates row-level security policy".
-- نضيف مسار is_admin() الموحّد (إيميل المالك OR دور أدمن OR admin_settings).
-- القراءة العامة للـ buckets العامة تبقى كما هي؛ هذه للإدارة فقط.
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "isadmin_manage_book_covers" ON storage.objects;
CREATE POLICY "isadmin_manage_book_covers" ON storage.objects
  FOR ALL TO authenticated
  USING      (bucket_id = 'book-covers' AND public.is_admin())
  WITH CHECK (bucket_id = 'book-covers' AND public.is_admin());

DROP POLICY IF EXISTS "isadmin_manage_product_images" ON storage.objects;
CREATE POLICY "isadmin_manage_product_images" ON storage.objects
  FOR ALL TO authenticated
  USING      (bucket_id = 'product-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "isadmin_manage_ebooks" ON storage.objects;
CREATE POLICY "isadmin_manage_ebooks" ON storage.objects
  FOR ALL TO authenticated
  USING      (bucket_id = 'ebooks' AND public.is_admin())
  WITH CHECK (bucket_id = 'ebooks' AND public.is_admin());
