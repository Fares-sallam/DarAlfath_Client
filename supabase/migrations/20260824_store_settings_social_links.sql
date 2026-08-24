-- Social media links, admin-editable from the dashboard instead of
-- hardcoded in the storefront's source (src/data/socialLinks.ts used to
-- ship 5 unfilled placeholder URLs live in the footer on every page).
-- One column per platform (not a jsonb blob) so the dashboard form and
-- RLS stay simple and match every other store_settings field.
alter table public.store_settings
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists whatsapp_url text,
  add column if not exists youtube_url text,
  add column if not exists website_url text;
