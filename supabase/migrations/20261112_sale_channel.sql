-- Book discounts per channel (2026-11-12): each edition's discount can be for the website, the app,
-- or both (product_variants.sale_channel, default both = how every book works today). On a channel
-- the discount is not for, the edition sells at its price before the discount (the old price, or
-- the selling price when that is higher).
--
-- The public views keep their columns, which now mean the WEBSITE price (the website reads them),
-- and gain the APP price at the end (app_price / app_discount_percent, app_* on the catalog), which
-- the app reads. create-storefront-order / initiate-paymob-payment / validate-coupon charge the
-- caller's channel price with the same rule.

alter table public.product_variants
  add column if not exists sale_channel text not null default 'all';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_variants_sale_channel_check'
  ) then
    alter table public.product_variants
      add constraint product_variants_sale_channel_check check (sale_channel in ('all', 'web', 'app'));
  end if;
end;
$$;

-- ───────────────────────── product_variants_public ─────────────────────────
create or replace view public.product_variants_public as
select
  pv.id as variant_id,
  pv.product_id,
  p.title,
  pv.variant_name,
  pv.variant_type,
  pv.sku,
  co.id as country_id,
  co.code as country_code,
  co.currency,
  co.currency_symbol,
  pr.old_price,
  pr.web_price as new_price,
  pr.web_price as price,
  case when pr.old_price > pr.web_price
       then round((pr.old_price - pr.web_price) / pr.old_price * 100::numeric, 0)
       else 0::numeric end as discount_percent,
  pv.variant_type = 'رقمي'::text as is_digital,
  case
    when pv.variant_type = 'رقمي'::text then true
    when p.is_bundle then bundle_available_stock(pv.id, co.id) > 0
    when (coalesce(pi.stock, 0) - coalesce(pi.reserved_stock, 0)) > 0 then true
    else false
  end as is_available,
  case
    when pv.variant_type = 'رقمي'::text then null::integer
    when p.is_bundle then bundle_available_stock(pv.id, co.id)
    else greatest(coalesce(pi.stock, 0) - coalesce(pi.reserved_stock, 0), 0)
  end as available_stock,
  pv.weight_kg,
  -- the app's price for the same edition
  pr.app_price,
  case when pr.old_price > pr.app_price
       then round((pr.old_price - pr.app_price) / pr.old_price * 100::numeric, 0)
       else 0::numeric end as app_discount_percent,
  pv.sale_channel
from product_variants pv
  join products p on p.id = pv.product_id
  join countries co on co.is_active = true
  left join product_variant_country_prices pvcp on pvcp.variant_id = pv.id and pvcp.country_id = co.id
  left join product_inventory pi on pi.product_id = pv.product_id and pi.variant_id = pv.id and pi.country_id = co.id
  cross join lateral (
    select
      coalesce(pvcp.base_price, pv.base_price, pvcp.price, pv.price) as old_price,
      coalesce(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price) as sale_price
  ) b
  cross join lateral (
    select
      b.old_price,
      case when pv.sale_channel in ('all', 'web') then b.sale_price else greatest(b.old_price, b.sale_price) end as web_price,
      case when pv.sale_channel in ('all', 'app') then b.sale_price else greatest(b.old_price, b.sale_price) end as app_price
  ) pr
where p.is_active = true
  and coalesce(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price, 0::numeric) > 0::numeric;

-- ───────────────────────── products_public_catalog ─────────────────────────
create or replace view public.products_public_catalog as
with variant_rows as (
  select
    pv.product_id,
    co.id as country_id,
    co.code as country_code,
    co.currency,
    co.currency_symbol,
    coalesce(pvcp.base_price, pv.base_price, pvcp.price, pv.price) as old_price,
    coalesce(pvcp.base_price, pv.base_price) as base_only,
    case when pv.sale_channel in ('all', 'web')
         then coalesce(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price)
         else greatest(coalesce(pvcp.base_price, pv.base_price, pvcp.price, pv.price),
                       coalesce(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price)) end as web_price,
    case when pv.sale_channel in ('all', 'app')
         then coalesce(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price)
         else greatest(coalesce(pvcp.base_price, pv.base_price, pvcp.price, pv.price),
                       coalesce(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price)) end as app_price
  from product_variants pv
    join countries co on co.is_active = true
    left join product_variant_country_prices pvcp on pvcp.variant_id = pv.id and pvcp.country_id = co.id
  where coalesce(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price, 0::numeric) > 0::numeric
), variant_prices as (
  select
    product_id, country_id, country_code, currency, currency_symbol,
    min(case when web_price > 0 then web_price end) as min_price,
    max(case when web_price > 0 then web_price end) as max_price,
    min(old_price) as min_old_price,
    max(case when base_only > web_price and base_only > 0
             then round((base_only - web_price) / base_only * 100::numeric, 0) else 0::numeric end) as max_discount_pct,
    count(*) as variant_count,
    min(case when app_price > 0 then app_price end) as app_min_price,
    max(case when app_price > 0 then app_price end) as app_max_price,
    max(case when base_only > app_price and base_only > 0
             then round((base_only - app_price) / base_only * 100::numeric, 0) else 0::numeric end) as app_max_discount_pct
  from variant_rows
  group by product_id, country_id, country_code, currency, currency_symbol
)
select
  p.id as product_id,
  p.title,
  p.author,
  p.description,
  coalesce((select pi2.url from product_images pi2 where pi2.product_id = p.id
            order by pi2.is_primary desc, pi2.sort_order limit 1), p.cover_url) as main_image_url,
  p.cover_url,
  p.category_id,
  c.name as category_name,
  c.slug as category_slug,
  p.isbn,
  p.keywords,
  p.type,
  vp.country_id,
  vp.country_code,
  vp.currency,
  vp.currency_symbol,
  vp.min_price,
  vp.max_price,
  vp.min_price as starting_price,
  vp.variant_count,
  case when vp.min_old_price > vp.min_price then vp.min_old_price else null::numeric end as old_price,
  vp.min_price as new_price,
  case when vp.min_old_price > vp.min_price
       then round((vp.min_old_price - vp.min_price) / vp.min_old_price * 100::numeric, 0)
       else 0::numeric end as discount_percent,
  coalesce(jsonb_agg(jsonb_build_object('id', pi.id, 'url', pi.url, 'alt_text', pi.alt_text,
             'is_primary', pi.is_primary, 'sort_order', pi.sort_order)
           order by pi.is_primary desc, pi.sort_order) filter (where pi.id is not null), '[]'::jsonb) as images,
  p.created_at,
  vp.max_discount_pct,
  p.is_bundle,
  -- the app's prices for the same book
  vp.app_min_price,
  vp.app_max_price,
  case when vp.min_old_price > vp.app_min_price then vp.min_old_price else null::numeric end as app_old_price,
  vp.app_min_price as app_new_price,
  case when vp.min_old_price > vp.app_min_price
       then round((vp.min_old_price - vp.app_min_price) / vp.min_old_price * 100::numeric, 0)
       else 0::numeric end as app_discount_percent,
  vp.app_max_discount_pct
from products p
  join variant_prices vp on vp.product_id = p.id
  left join categories c on c.id = p.category_id
  left join product_images pi on pi.product_id = p.id
where p.is_active = true
group by p.id, p.title, p.author, p.description, p.cover_url, p.category_id, c.name, c.slug, p.isbn,
         p.keywords, p.type, vp.country_id, vp.country_code, vp.currency, vp.currency_symbol, vp.min_price,
         vp.max_price, vp.min_old_price, vp.max_discount_pct, vp.variant_count, p.created_at, p.is_bundle,
         vp.app_min_price, vp.app_max_price, vp.app_max_discount_pct;
