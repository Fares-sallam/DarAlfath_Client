-- The company links page (/links on the storefront): one page that gathers everything the company
-- has online (the store, the app, every social account, current offers), set from the dashboard
-- (إدارة الصفحة والروابط). The page is a list of blocks in the order the dashboard gives them:
-- a link, an offer, a picture, a heading, a paragraph or a divider.
--
--   links_page_settings  one row (id = 1): the page's heading, the line under the logo, its look, its SEO
--   links_page_blocks    one row per block, in sort_order
--
-- Reads follow the other content tables (site_announcements, intro_videos): visitors only get the
-- blocks that are switched on and inside their dates; admins (is_admin()) can do everything.
-- Pictures go to the existing public site-assets bucket (folder links-page/), so no new bucket.
-- Purely additive: nothing the store or the app reads today is touched.

-- ── Page settings (a single row) ─────────────────────────────────────────────────────────────
create table if not exists public.links_page_settings (
  id              smallint primary key default 1 check (id = 1),
  is_enabled      boolean not null default true,
  -- The visible heading under the logo. Empty: the page shows only the logo and the line below it.
  title           text not null default '' check (char_length(title) <= 120),
  tagline         text not null default '' check (char_length(tagline) <= 300),
  show_logo       boolean not null default true,
  button_shape    text not null default 'rounded' check (button_shape in ('rounded', 'pill', 'square')),
  -- pattern: a faint wash of the house pattern behind the header; plain: none.
  background      text not null default 'pattern' check (background in ('pattern', 'plain')),
  footer_text     text not null default '' check (char_length(footer_text) <= 300),
  -- What search engines and link previews (WhatsApp, Facebook...) show. Empty: the page's own defaults.
  seo_title       text not null default '' check (char_length(seo_title) <= 120),
  seo_description text not null default '' check (char_length(seo_description) <= 300),
  share_image_url text check (
    share_image_url is null or share_image_url = '' or
    (share_image_url ~* '^https://' and char_length(share_image_url) <= 2000 and share_image_url !~ '[[:space:][:cntrl:]]')
  ),
  updated_at      timestamptz not null default now()
);

comment on table public.links_page_settings is
  'Settings of the storefront /links page (one row, id = 1). Edited in the dashboard: إدارة الصفحة والروابط.';

-- ── Blocks ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.links_page_blocks (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('link', 'offer', 'image', 'heading', 'text', 'divider')),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  -- link/offer: the label. image: its description. heading: the heading. text: unused.
  title       text not null default '' check (char_length(title) <= 160),
  -- link/offer: the line under the label. text: the paragraph.
  body        text not null default '' check (char_length(body) <= 1500),
  -- Where a link/offer/image goes: https://..., mailto:, tel:, #anchor, or a path inside the store (/books).
  -- Nothing else (no javascript:, data:, //host or backslashes) can be stored, even by an admin.
  url         text check (
    url is null or url = '' or (
      char_length(url) <= 2000
      and url !~ '[[:space:][:cntrl:]\\]'
      and (url ~* '^(https?://|mailto:|tel:|#)' or url ~ '^/([^/]|$)')
    )
  ),
  -- The offer's button text.
  cta_label   text check (cta_label is null or char_length(cta_label) <= 40),
  image_url   text check (
    image_url is null or image_url = '' or
    (image_url ~* '^https://' and char_length(image_url) <= 2000 and image_url !~ '[[:space:][:cntrl:]]')
  ),
  -- A key of the dashboard's icon list (facebook, whatsapp, store...). Unknown keys draw no icon.
  icon        text check (icon is null or icon ~ '^[a-z0-9_-]{1,30}$'),
  -- A small tag on a link/offer ("جديد", "خصم 20%").
  badge       text check (badge is null or char_length(badge) <= 30),
  coupon_code text check (coupon_code is null or coupon_code ~ '^[A-Za-z0-9_-]{1,40}$'),
  -- How the block looks: colour, size, alignment, divider type and length... The page reads every key
  -- through a whitelist, so an unknown or malformed value falls back to the default instead of breaking it.
  look        jsonb not null default '{}'::jsonb check (jsonb_typeof(look) = 'object' and octet_length(look::text) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint links_page_blocks_window_chk check (starts_at is null or ends_at is null or ends_at > starts_at)
);

comment on table public.links_page_blocks is
  'Blocks of the storefront /links page, in sort_order. Edited in the dashboard: إدارة الصفحة والروابط.';

create index if not exists links_page_blocks_order_idx
  on public.links_page_blocks (sort_order, created_at);

-- ── Row level security ───────────────────────────────────────────────────────────────────────
alter table public.links_page_settings enable row level security;
alter table public.links_page_blocks   enable row level security;

drop policy if exists "public_read_links_page_settings" on public.links_page_settings;
create policy "public_read_links_page_settings"
  on public.links_page_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "isadmin_full_links_page_settings" on public.links_page_settings;
create policy "isadmin_full_links_page_settings"
  on public.links_page_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Storefront: only blocks that are on and inside their dates (the same rule as site_announcements).
drop policy if exists "public_read_live_links_page_blocks" on public.links_page_blocks;
create policy "public_read_live_links_page_blocks"
  on public.links_page_blocks
  for select
  to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

drop policy if exists "isadmin_full_links_page_blocks" on public.links_page_blocks;
create policy "isadmin_full_links_page_blocks"
  on public.links_page_blocks
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── updated_at ───────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_links_page_settings_updated_at on public.links_page_settings;
create trigger trg_links_page_settings_updated_at
  before update on public.links_page_settings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_links_page_blocks_updated_at on public.links_page_blocks;
create trigger trg_links_page_blocks_updated_at
  before update on public.links_page_blocks
  for each row execute function public.set_updated_at();

-- ── A first page, so /links is useful from day one ───────────────────────────────────────────
-- The store, the contact page, a hidden slot for the app (switched on once its store links exist),
-- and the social accounts already saved in the store settings. Everything can be edited or removed.
insert into public.links_page_settings (id, tagline)
values (1, 'ننشر المعرفة الهادفة ونبني جسرًا واسعًا من الكتب الأصيلة بين القارئ والعلم والثقافة والقيم.')
on conflict (id) do nothing;

do $$
declare
  s record;
begin
  if exists (select 1 from public.links_page_blocks) then
    return;
  end if;

  select facebook_url, instagram_url, whatsapp_url, youtube_url
    into s
    from public.store_settings
   order by updated_at desc
   limit 1;

  insert into public.links_page_blocks (kind, sort_order, is_active, title, body, url, icon, look) values
    ('link',    10, true,  'تسوّق من المتجر',       'كتب دار الفتح الورقية والرقمية', '/',        'store', '{"style":"primary","display":"button"}'),
    ('link',    20, true,  'تواصل معنا',            'لأي استفسار عن الكتب أو الطلبات', '/contact', 'email', '{"style":"mint","display":"button"}'),
    ('link',    30, false, 'حمّل تطبيق دار الفتح',  'قريبًا على App Store و Google Play', null,    'app',   '{"style":"teal","display":"button"}'),
    ('divider', 40, true,  '',                      '',                               null,      null,    '{"type":"pattern","length":"medium"}'),
    ('heading', 50, true,  'تابعنا',                '',                               null,      null,    '{"align":"center","size":"md"}');

  -- A saved address that the url rules above refuse (a stray space, say) is skipped, never fatal.
  if coalesce(s.facebook_url, '') <> '' then
    begin
      insert into public.links_page_blocks (kind, sort_order, title, url, icon, look)
      values ('link', 60, 'فيسبوك', btrim(s.facebook_url), 'facebook', '{"style":"primary","display":"icon"}');
    exception when check_violation then null;
    end;
  end if;
  if coalesce(s.instagram_url, '') <> '' then
    begin
      insert into public.links_page_blocks (kind, sort_order, title, url, icon, look)
      values ('link', 70, 'إنستجرام', btrim(s.instagram_url), 'instagram', '{"style":"primary","display":"icon"}');
    exception when check_violation then null;
    end;
  end if;
  if coalesce(s.whatsapp_url, '') <> '' then
    begin
      insert into public.links_page_blocks (kind, sort_order, title, url, icon, look)
      values ('link', 80, 'واتساب', btrim(s.whatsapp_url), 'whatsapp', '{"style":"primary","display":"icon"}');
    exception when check_violation then null;
    end;
  end if;
  if coalesce(s.youtube_url, '') <> '' then
    begin
      insert into public.links_page_blocks (kind, sort_order, title, url, icon, look)
      values ('link', 90, 'يوتيوب', btrim(s.youtube_url), 'youtube', '{"style":"primary","display":"icon"}');
    exception when check_violation then null;
    end;
  end if;
end
$$;
