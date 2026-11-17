-- Look controls set from the dashboard (مظهر المتجر + إعدادات صفحة الروابط).
--
--   storefront_appearance      one row (id = 1): how strongly the brand pattern shows in the store, how the pattern
--                              strips between home sections are arranged (identical or varied), which home sections
--                              show and in what order, and the colour of four buttons (only the house colours).
--   links_page_settings        two new columns: where the pattern sits behind the links page (top or bottom) and how
--                              strongly it shows there (the links page has its own slider, separate from the store's).
--
-- A divider block of the links page keeps its own arrangement inside its existing `look` jsonb (look.arrangement),
-- so that table needs nothing.
--
-- The store and the dashboard read every value through a whitelist, so a value that is not on it falls back to the
-- house look instead of breaking a page. The defaults below are exactly today's look: nothing changes for customers
-- until something is saved in the dashboard. Purely additive; reads follow links_page_settings (public read,
-- is_admin() writes).

-- ── Links page: pattern position and strength ────────────────────────────────────────────────
alter table public.links_page_settings
  add column if not exists pattern_position text not null default 'top',
  add column if not exists pattern_strength smallint not null default 100;

alter table public.links_page_settings drop constraint if exists links_page_settings_pattern_position_chk;
alter table public.links_page_settings
  add constraint links_page_settings_pattern_position_chk check (pattern_position in ('top', 'bottom'));

alter table public.links_page_settings drop constraint if exists links_page_settings_pattern_strength_chk;
alter table public.links_page_settings
  add constraint links_page_settings_pattern_strength_chk check (pattern_strength between 0 and 200);

comment on column public.links_page_settings.pattern_position is
  'Where the brand pattern sits behind the links page: fading down from the top, or rising from the bottom.';
comment on column public.links_page_settings.pattern_strength is
  'How strongly the pattern shows on the links page, in percent of the designed strength (0 hides it, 100 as designed, 200 twice).';

-- ── Store appearance (a single row) ──────────────────────────────────────────────────────────
create table if not exists public.storefront_appearance (
  id                smallint primary key default 1 check (id = 1),
  -- Percent of the designed strength of the pattern behind the home page and in the footer (0 hides it).
  pattern_strength  smallint not null default 100 check (pattern_strength between 0 and 200),
  -- The pattern strips between home sections: every unit a copy of one drawing, or the units trade colours.
  strip_arrangement text not null default 'uniform' check (strip_arrangement in ('uniform', 'varied')),
  -- [{"key":"best-sellers","visible":true}, ...] in the order the home page shows them. A section that is
  -- missing is added at the end by the store; an unknown key is ignored.
  home_sections     jsonb not null default '[]'::jsonb
    check (jsonb_typeof(home_sections) = 'array' and jsonb_array_length(home_sections) <= 20 and octet_length(home_sections::text) <= 2000),
  -- {"add_to_cart":{"color":"teal","tone":1}, ...}: color is navy / teal / green / mint (or default), tone -2..2.
  button_styles     jsonb not null default '{}'::jsonb
    check (jsonb_typeof(button_styles) = 'object' and octet_length(button_styles::text) <= 2000),
  updated_at        timestamptz not null default now()
);

comment on table public.storefront_appearance is
  'How the storefront looks (one row, id = 1). Edited in the dashboard: مظهر المتجر.';

-- ── Row level security ───────────────────────────────────────────────────────────────────────
alter table public.storefront_appearance enable row level security;

drop policy if exists "public_read_storefront_appearance" on public.storefront_appearance;
create policy "public_read_storefront_appearance"
  on public.storefront_appearance
  for select
  to anon, authenticated
  using (true);

drop policy if exists "isadmin_full_storefront_appearance" on public.storefront_appearance;
create policy "isadmin_full_storefront_appearance"
  on public.storefront_appearance
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── updated_at ───────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_storefront_appearance_updated_at on public.storefront_appearance;
create trigger trg_storefront_appearance_updated_at
  before update on public.storefront_appearance
  for each row execute function public.set_updated_at();

-- The row exists from the start with today's look, so the dashboard has something to edit.
insert into public.storefront_appearance (id) values (1) on conflict (id) do nothing;
