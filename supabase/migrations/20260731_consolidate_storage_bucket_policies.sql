-- ══════════════════════════════════════════════════════════════════════════
-- book-covers/product-images buckets are public=true — object display via
-- getPublicUrl() is served through Storage's separate public endpoint and
-- does not depend on these storage.objects RLS policies at all. The 4
-- overlapping SELECT policies per bucket only grant `storage.objects` LIST/
-- read via the authenticated API path (bucket-content enumeration), which
-- nothing in either app's code uses (confirmed: only .getPublicUrl() calls
-- exist, no .list()/.download()). Consolidating down to the two existing
-- isadmin_manage_* policies (FOR ALL, is_admin()), which already cover
-- everything a legitimate admin upload/delete flow needs.
-- ══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admin_delete_covers"        ON storage.objects;
DROP POLICY IF EXISTS "admins delete book-covers"  ON storage.objects;
DROP POLICY IF EXISTS "admins update book-covers"  ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_covers"  ON storage.objects;
DROP POLICY IF EXISTS "public read book-covers"    ON storage.objects;
DROP POLICY IF EXISTS "public_read_book_covers"    ON storage.objects;
DROP POLICY IF EXISTS "public_read_covers"         ON storage.objects;

DROP POLICY IF EXISTS "admins delete product-images"  ON storage.objects;
DROP POLICY IF EXISTS "admins update product-images"  ON storage.objects;
DROP POLICY IF EXISTS "product_images_admin_delete"   ON storage.objects;
DROP POLICY IF EXISTS "product_images_auth_read"      ON storage.objects;
DROP POLICY IF EXISTS "product_images_public_read"    ON storage.objects;
DROP POLICY IF EXISTS "public read product-images"    ON storage.objects;
DROP POLICY IF EXISTS "public_read_product_images"    ON storage.objects;

-- isadmin_manage_book_covers / isadmin_manage_product_images (FOR ALL, is_admin())
-- already exist and are left untouched — they cover admin read+write fully.
