-- Admin-manageable hero slides for the homepage's product-showcase display.
-- Requested explicitly: the images shown in the hero need a slot in the
-- dashboard so they can be added/removed/reordered independently of the
-- product catalog (the catalog currently has a single placeholder item, so
-- coupling the hero to "top products" would leave it empty).

create table if not exists public.home_hero_slides (
  id          uuid primary key default gen_random_uuid(),
  image_url   text not null,
  title       text,
  link_url    text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.home_hero_slides is
  'Admin-managed images shown on the homepage hero showcase (book pedestal display). Independent of the products table so the hero can be curated before the catalog is full.';

alter table public.home_hero_slides enable row level security;

-- Storefront: only active slides, orderable by sort_order.
create policy "public_read_active_hero_slides"
  on public.home_hero_slides
  for select
  to anon, authenticated
  using (is_active = true);

-- Dashboard: full control for admins only.
create policy "isadmin_full_hero_slides"
  on public.home_hero_slides
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists home_hero_slides_sort_idx
  on public.home_hero_slides (sort_order) where is_active = true;

-- keep updated_at honest on every edit from the dashboard
create or replace function public.set_home_hero_slides_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_home_hero_slides_updated_at on public.home_hero_slides;
create trigger trg_home_hero_slides_updated_at
  before update on public.home_hero_slides
  for each row execute function public.set_home_hero_slides_updated_at();

-- ── Storage bucket for the slide images ─────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hero-images', 'hero-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "isadmin_manage_hero_images"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'hero-images' and public.is_admin())
  with check (bucket_id = 'hero-images' and public.is_admin());
