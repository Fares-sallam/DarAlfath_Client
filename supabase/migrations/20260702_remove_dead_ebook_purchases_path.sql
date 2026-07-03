-- ══════════════════════════════════════════════════════════════════════════
-- إزالة مسار تحميل الكتب الرقمية القديم الميت (get_ebook_signed_url +
-- ebook_purchases). الجدول فارغ دائمًا (0 صف) ولا يوجد أي trigger يملؤه —
-- التطبيق والموقع كلاهما يستخدمان create-digital-download-link الحالية
-- (تتحقق من الملكية عبر orders/order_items مباشرة + بوابة x-app-key)، وليس
-- هذا المسار. تم تأكيد عدم استخدامه في التطبيق مع المستخدم قبل الحذف.
-- الدوال Edge المقابلة (get-ebook-url القديمة) حُذفت من لوحة Supabase مباشرة.
-- ══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "buyer_select_ebooks" ON storage.objects;
DROP FUNCTION IF EXISTS public.get_ebook_signed_url(uuid);
DROP TABLE IF EXISTS public.ebook_purchases;
