-- The storefront's top menu bar (الرئيسية، الكتب، one dropdown per series، تواصل معنا): its
-- order and which items show, set from the dashboard (إدارة الإعلانات والأشرطة → شريط القائمة).
-- [{ "key": "home" | "books" | "contact" | "series:<uuid>", "visible": true }, ...]
-- NULL = the default order (home, books, the series by their sort_order, contact). A series
-- missing from the list (added later) shows after the last series in it.
alter table public.site_content_settings add column if not exists header_nav jsonb;
