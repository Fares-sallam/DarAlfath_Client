-- A book being placed in more than one category was requested explicitly
-- using multi-series as the precedent ("زي السلاسل") — this mirrors
-- product_series' exact shape and RLS pattern. products.category_id
-- stays as the required "primary" category (unchanged everywhere it's
-- already used — dashboard list/filter/export, storefront's single-
-- category queries); this table adds "also show this book under these
-- categories too" on top, additive only.
create table if not exists public.product_categories (
  product_id  uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

comment on table public.product_categories is
  'Additional categories a product also appears under, beyond its required products.category_id primary category. Same shape/purpose as product_series.';

alter table public.product_categories enable row level security;

create policy "public_read_product_categories"
  on public.product_categories
  for select
  to anon, authenticated
  using (true);

create policy "isadmin_full_product_categories"
  on public.product_categories
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists product_categories_category_id_idx
  on public.product_categories (category_id);
