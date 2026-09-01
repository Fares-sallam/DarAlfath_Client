-- Real customer reviews, replacing the previous fake/pseudo-random
-- rating & reviews_count shown on every product (getPseudoRating() in
-- useStorefront.ts — a number derived from the product id, not from any
-- actual customer). Verified-purchase gated: a review can only be
-- inserted for a product the reviewing customer actually received.
create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_name text not null default 'قارئ',
  rating smallint not null check (rating between 1 and 5),
  comment text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create index product_reviews_product_id_idx on public.product_reviews (product_id);

alter table public.product_reviews enable row level security;

-- Anyone (including anon) can read reviews that aren't moderated away.
create policy public_read_product_reviews on public.product_reviews
  for select to anon, authenticated
  using (is_hidden = false);

-- A customer may only insert a review for themselves, and only for a
-- product they actually received (order status = تم التوصيل) — this is
-- what makes it a real "verified purchase" system instead of open text.
create policy customer_insert_own_review on public.product_reviews
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.user_id = auth.uid()
        and o.status = 'تم التوصيل'
        and oi.product_id = product_reviews.product_id
    )
  );

create policy customer_update_own_review on public.product_reviews
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy customer_delete_own_review on public.product_reviews
  for delete to authenticated
  using (auth.uid() = user_id);

-- Admin moderation: hide/delete any review, regardless of ownership.
create policy admin_full_product_reviews on public.product_reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create trigger set_product_reviews_updated_at
  before update on public.product_reviews
  for each row execute function public.set_updated_at();

-- Pre-aggregated per-product stats (real replacement for the old
-- deterministic-fake rating/reviews_count on the storefront).
-- security_invoker=true: without it, a Postgres view runs with the view
-- OWNER's privileges by default, bypassing product_reviews' own RLS
-- entirely — the aggregate would silently include hidden/moderated
-- reviews for every caller. With it, the view runs as the querying user,
-- so is_hidden filtering applies exactly as if they queried the table.
create view public.product_review_stats
  with (security_invoker = true) as
select
  product_id,
  count(*)::int as reviews_count,
  round(avg(rating)::numeric, 1) as avg_rating
from public.product_reviews
where is_hidden = false
group by product_id;

grant select on public.product_review_stats to anon, authenticated;
