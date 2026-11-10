-- How the footer's paragraph sits, chosen in the dashboard (الإعدادات → إعدادات المتجر → تنسيق النص):
-- start (the right edge, as it always was), center, or justify (every line flush on both sides).
alter table public.store_settings
  add column if not exists footer_tagline_align text not null default 'start'
  check (footer_tagline_align in ('start', 'center', 'justify'));
