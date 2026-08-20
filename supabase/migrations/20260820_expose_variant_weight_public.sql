-- ══════════════════════════════════════════════════════════════════════════
-- Expose product_variants.weight_kg through the public storefront view, so
-- the product page can show the book's shipping weight to shoppers (a plain
-- spec, not sensitive — same visibility tier as variant_name/sku already on
-- this view). CREATE OR REPLACE VIEW with the same definition plus this one
-- added column — appended at the END of the SELECT list, since Postgres
-- only allows CREATE OR REPLACE VIEW to add trailing columns, not insert
-- one in the middle (that would count as dropping/renaming existing
-- columns and get rejected). Nothing else about the view changes.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.product_variants_public AS
SELECT
  pv.id AS variant_id,
  pv.product_id,
  p.title,
  pv.variant_name,
  pv.variant_type,
  pv.sku,
  co.id AS country_id,
  co.code AS country_code,
  co.currency,
  co.currency_symbol,
  COALESCE(pvcp.base_price, pv.base_price, pvcp.price, pv.price) AS old_price,
  COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price) AS new_price,
  COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price) AS price,
  CASE
    WHEN COALESCE(pvcp.base_price, pv.base_price, pvcp.price, pv.price) > COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price)
      THEN round((COALESCE(pvcp.base_price, pv.base_price, pvcp.price, pv.price) - COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price)) / COALESCE(pvcp.base_price, pv.base_price, pvcp.price, pv.price) * 100::numeric, 0)
    ELSE 0::numeric
  END AS discount_percent,
  pv.variant_type = 'رقمي'::text AS is_digital,
  CASE
    WHEN pv.variant_type = 'رقمي'::text THEN true
    WHEN (COALESCE(pi.stock, 0) - COALESCE(pi.reserved_stock, 0)) > 0 THEN true
    ELSE false
  END AS is_available,
  CASE
    WHEN pv.variant_type = 'رقمي'::text THEN NULL::integer
    ELSE GREATEST(COALESCE(pi.stock, 0) - COALESCE(pi.reserved_stock, 0), 0)
  END AS available_stock,
  pv.weight_kg
FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  JOIN countries co ON co.is_active = true
  LEFT JOIN product_variant_country_prices pvcp ON pvcp.variant_id = pv.id AND pvcp.country_id = co.id
  LEFT JOIN product_inventory pi ON pi.product_id = pv.product_id AND pi.variant_id = pv.id AND pi.country_id = co.id
WHERE p.is_active = true
  AND COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price, 0::numeric) > 0::numeric;
