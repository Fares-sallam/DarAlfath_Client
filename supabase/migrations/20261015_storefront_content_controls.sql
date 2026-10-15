-- ══════════════════════════════════════════════════════════════════════════
-- What the dashboard's new "إدارة الإعلانات والأشرطة" page controls on the
-- store, plus two texts that were hard-coded:
--   • site_announcements   — the offers/ads strip under the header
--   • category_bar_items   — which categories the category strip shows, in
--                            what order (a category with no row is shown,
--                            after the ordered ones)
--   • home_feature_boxes   — the four boxes above the footer
--   • home_best_sellers    — the "الأكثر مبيعًا" row that replaces "من رفوف الدار"
--   • site_content_settings (one row) — "كل الكتب" in the strip on/off, and
--                            the videos section's title
--   • store_settings.footer_tagline — the footer's line under the logo
-- Same shape as home_hero_slides / intro_videos: anyone reads what is on
-- show, admins (is_admin()) write. Settings that the products staff edit
-- live in site_content_settings rather than store_settings, whose write
-- policies are for the store's owners.
-- ══════════════════════════════════════════════════════════════════════════

-- ── The footer's line ─────────────────────────────────────────────────────
alter table public.store_settings add column if not exists footer_tagline text;

-- ── One row of content settings ───────────────────────────────────────────
create table if not exists public.site_content_settings (
  id                 integer primary key default 1 check (id = 1),
  all_books_in_bar   boolean not null default true,
  intro_videos_title text    not null default 'فيديوهات تعريفية' check (char_length(intro_videos_title) between 1 and 60),
  updated_at         timestamptz not null default now()
);
insert into public.site_content_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_content_settings enable row level security;
create policy "public_read_site_content_settings" on public.site_content_settings
  for select to anon, authenticated using (true);
create policy "isadmin_update_site_content_settings" on public.site_content_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger trg_site_content_settings_updated_at
  before update on public.site_content_settings
  for each row execute function public.set_updated_at();

-- ── The offers / ads strip ────────────────────────────────────────────────
create table if not exists public.site_announcements (
  id          uuid primary key default gen_random_uuid(),
  message     text not null check (char_length(btrim(message)) between 1 and 200),
  link_url    text check (link_url is null or char_length(link_url) <= 500),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
comment on table public.site_announcements is
  'Messages in the strip under the storefront header (offers, notices). Shown while active and inside their optional dates.';

alter table public.site_announcements enable row level security;
-- The store sees a message only while it is on and inside its dates.
create policy "public_read_live_site_announcements" on public.site_announcements
  for select to anon, authenticated
  using (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy "isadmin_full_site_announcements" on public.site_announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists site_announcements_sort_idx on public.site_announcements (sort_order) where is_active;
create trigger trg_site_announcements_updated_at
  before update on public.site_announcements
  for each row execute function public.set_updated_at();

-- ── The category strip: shown or hidden, and order ────────────────────────
create table if not exists public.category_bar_items (
  category_id uuid primary key references public.categories(id) on delete cascade,
  is_visible  boolean not null default true,
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);
comment on table public.category_bar_items is
  'Which categories the storefront category strip shows and in what order. A category with no row here is shown, after the ordered ones.';

alter table public.category_bar_items enable row level security;
create policy "public_read_category_bar_items" on public.category_bar_items
  for select to anon, authenticated using (true);
create policy "isadmin_full_category_bar_items" on public.category_bar_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger trg_category_bar_items_updated_at
  before update on public.category_bar_items
  for each row execute function public.set_updated_at();

-- ── The four boxes above the footer ───────────────────────────────────────
create table if not exists public.home_feature_boxes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 60),
  description text check (description is null or char_length(description) <= 200),
  icon_key    text check (icon_key is null or icon_key ~ '^[a-z0-9-]{1,40}$'),
  image_url   text check (image_url is null or char_length(image_url) <= 500),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.home_feature_boxes is
  'The boxes above the storefront footer: a title, a line of text, and an icon from a fixed list or an uploaded picture.';

alter table public.home_feature_boxes enable row level security;
create policy "public_read_active_home_feature_boxes" on public.home_feature_boxes
  for select to anon, authenticated using (is_active);
create policy "isadmin_full_home_feature_boxes" on public.home_feature_boxes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger trg_home_feature_boxes_updated_at
  before update on public.home_feature_boxes
  for each row execute function public.set_updated_at();

-- The four boxes the store shows today, so nothing changes on the day this lands.
insert into public.home_feature_boxes (title, description, icon_key, sort_order)
select * from (values
  ('دعم العملاء',       'فريق دار الفتح جاهز لمساعدتك في أي وقت قبل الشراء وبعده.',         'headphones',      0),
  ('أسعار حسب دولتك',   'العملة والأسعار تتكيف تلقائيًا حسب الدولة التي تختارها.',            'credit-card',     1),
  ('مخزون دقيق ومحدّث', 'عدد النسخ المتاحة يظهر لك قبل الشراء لضمان وصول طلبك.',             'book-open-text',  2),
  ('تسليم موثوق',       'نتعاون مع شركات شحن معتمدة لضمان وصول كتبك بأمان وسرعة.',           'truck',           3)
) as seed(title, description, icon_key, sort_order)
where not exists (select 1 from public.home_feature_boxes);

-- ── "الأكثر مبيعًا" ───────────────────────────────────────────────────────
create table if not exists public.home_best_sellers (
  product_id uuid primary key references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.home_best_sellers is
  'The books in the home page "الأكثر مبيعًا" row, picked in the dashboard (which shows each book''s sales to choose by). Only ids and order: sales figures stay admin-only.';

alter table public.home_best_sellers enable row level security;
create policy "public_read_home_best_sellers" on public.home_best_sellers
  for select to anon, authenticated using (true);
create policy "isadmin_full_home_best_sellers" on public.home_best_sellers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Starts empty: the row stays hidden until books are picked in the dashboard (only one book has
-- sales so far, and a row of one looks unfinished).

-- ── Pictures for the boxes ────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "isadmin_manage_site_assets"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'site-assets' and public.is_admin())
  with check (bucket_id = 'site-assets' and public.is_admin());
