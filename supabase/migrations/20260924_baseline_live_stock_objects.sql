-- ═══════════════════════════════════════════════════════════════════════
-- BASELINE RECORD — no behavior change.
--
-- The live definitions of the stock/order objects, pulled verbatim with
-- pg_get_functiondef / pg_get_viewdef on 2026-09-24. They were created by
-- hand in the SQL editor (supabase/DEPLOY.md's 001_stock_management.sql,
-- never committed), so until now the repo had no copy of the code that
-- actually reserves stock for every order. Recorded here, unchanged, so
-- 20260924_product_bundles.sql right after it is a readable diff against
-- what really runs.
-- ═══════════════════════════════════════════════════════════════════════

-- ── create_order_with_stock_deduction ──
CREATE OR REPLACE FUNCTION public.create_order_with_stock_deduction(p_user_id uuid, p_country_id text, p_payment_method_id text, p_shipping_cost numeric, p_shipping_address jsonb, p_notes text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id       TEXT;
  v_country_uuid   UUID;
  v_total_price    NUMERIC := 0;
  v_item           JSONB;
  v_variant_id     UUID;
  v_product_id     UUID;
  v_quantity       INT;
  v_price          NUMERIC;
  v_is_digital     BOOLEAN;
  v_net_stock      INT;
BEGIN
  v_country_uuid := CASE
    WHEN p_country_id IS NULL OR TRIM(p_country_id) = '' THEN NULL
    ELSE p_country_id::UUID
  END;

  -- ── Phase 1: التحقق من المخزون ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity   := COALESCE((v_item->>'quantity')::INT, 1);

    SELECT COALESCE(pv.variant_type = 'رقمي', FALSE) INTO v_is_digital
      FROM product_variants pv WHERE pv.id = v_variant_id LIMIT 1;
    IF NOT FOUND THEN v_is_digital := FALSE; END IF;
    CONTINUE WHEN v_is_digital;

    SELECT GREATEST(COALESCE(pi.stock,0) - COALESCE(pi.reserved_stock,0), 0)
      INTO v_net_stock
      FROM product_inventory pi
     WHERE pi.variant_id = v_variant_id
       AND pi.product_id = v_product_id
       AND (v_country_uuid IS NULL OR pi.country_id = v_country_uuid)
     ORDER BY pi.country_id LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'لا يوجد مخزون مسجل لهذه النسخة. يرجى التواصل مع الدار.';
    END IF;
    IF v_net_stock < v_quantity THEN
      RAISE EXCEPTION 'الكمية المطلوبة (%) غير متوفرة. المتاح حالياً: % نسخة.',
        v_quantity, v_net_stock;
    END IF;
  END LOOP;

  -- ── Phase 2: حساب الإجمالي ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_price       := COALESCE((v_item->>'price_per_item')::NUMERIC, 0);
    v_quantity    := COALESCE((v_item->>'quantity')::INT, 1);
    v_total_price := v_total_price + (v_price * v_quantity);
  END LOOP;
  v_total_price := v_total_price + COALESCE(p_shipping_cost, 0);

  -- ── Phase 3: إنشاء الطلب — مع ضبط inventory_reserved=TRUE ──
  INSERT INTO orders (
    user_id, country_id, payment_method_id,
    status, payment_status,
    total_price, shipping_cost, discount_amount,
    shipping_address, notes,
    inventory_reserved, inventory_finalized   -- ← الإضافة المهمة
  )
  VALUES (
    p_user_id,
    v_country_uuid,
    CASE WHEN p_payment_method_id IS NULL OR TRIM(p_payment_method_id) = ''
         THEN NULL ELSE p_payment_method_id::UUID END,
    'جديد', 'معلق',
    v_total_price,
    COALESCE(p_shipping_cost, 0), 0,
    p_shipping_address,
    NULLIF(TRIM(COALESCE(p_notes, '')), ''),
    TRUE, FALSE   -- ← الحجز نشط، لم يُسلَّم بعد
  )
  RETURNING id INTO v_order_id;

  -- ── Phase 4: عناصر الطلب + حجز المخزون ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity   := COALESCE((v_item->>'quantity')::INT, 1);
    v_price      := COALESCE((v_item->>'price_per_item')::NUMERIC, 0);

    SELECT COALESCE(pv.variant_type = 'رقمي', FALSE) INTO v_is_digital
      FROM product_variants pv WHERE pv.id = v_variant_id LIMIT 1;
    IF NOT FOUND THEN v_is_digital := FALSE; END IF;

    INSERT INTO order_items (
      order_id, product_id, variant_id, quantity,
      price_per_item, discount_per_item, is_digital
    )
    VALUES (
      v_order_id, v_product_id, v_variant_id,
      v_quantity, v_price, 0, v_is_digital
    );

    IF NOT v_is_digital THEN
      UPDATE product_inventory
         SET reserved_stock = COALESCE(reserved_stock,0) + v_quantity,
             updated_at = NOW()
       WHERE variant_id = v_variant_id
         AND product_id = v_product_id
         AND (v_country_uuid IS NULL OR country_id = v_country_uuid);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('id', v_order_id, 'created_at', NOW());
END;
$function$;

-- ── finalize_order_inventory ──
CREATE OR REPLACE FUNCTION public.finalize_order_inventory(p_order_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_country_id uuid;
  v_inventory_reserved boolean;
  v_inventory_finalized boolean;
  v_bad_rows int;
begin
  select
    o.country_id,
    o.inventory_reserved,
    o.inventory_finalized
  into
    v_country_id,
    v_inventory_reserved,
    v_inventory_finalized
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if v_country_id is null then
    raise exception 'Order % has no country_id', p_order_id;
  end if;

  if v_inventory_finalized then
    return;
  end if;

  if not v_inventory_reserved then
    raise exception 'Order % inventory is not reserved yet', p_order_id;
  end if;

  with needed as (
    select
      oi.product_id,
      oi.variant_id,
      sum(oi.quantity)::int as qty
    from public.order_items oi
    where oi.order_id = p_order_id
      and coalesce(oi.is_digital, false) = false
    group by oi.product_id, oi.variant_id
  )
  select count(*)
  into v_bad_rows
  from needed n
  join public.product_inventory pi
    on pi.product_id = n.product_id
   and pi.country_id = v_country_id
   and pi.variant_id is not distinct from n.variant_id
  where pi.stock < n.qty
     or pi.reserved_stock < n.qty;

  if v_bad_rows > 0 then
    raise exception 'Inventory consistency check failed for order %', p_order_id;
  end if;

  update public.product_inventory pi
  set
    stock = pi.stock - src.qty,
    reserved_stock = greatest(pi.reserved_stock - src.qty, 0),
    updated_at = now()
  from (
    select
      oi.product_id,
      oi.variant_id,
      sum(oi.quantity)::int as qty
    from public.order_items oi
    where oi.order_id = p_order_id
      and coalesce(oi.is_digital, false) = false
    group by oi.product_id, oi.variant_id
  ) src
  where pi.product_id = src.product_id
    and pi.country_id = v_country_id
    and pi.variant_id is not distinct from src.variant_id;

  update public.orders
  set
    inventory_reserved = false,
    inventory_finalized = true,
    updated_at = now()
  where id = p_order_id;
end;
$function$;

-- ── release_order_inventory ──
CREATE OR REPLACE FUNCTION public.release_order_inventory(p_order_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_country_id uuid;
  v_inventory_reserved boolean;
  v_inventory_finalized boolean;
begin
  select
    o.country_id,
    o.inventory_reserved,
    o.inventory_finalized
  into
    v_country_id,
    v_inventory_reserved,
    v_inventory_finalized
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if v_country_id is null then
    raise exception 'Order % has no country_id', p_order_id;
  end if;

  if not v_inventory_reserved then
    return;
  end if;

  if v_inventory_finalized then
    raise exception 'Order % inventory already finalized; cannot release', p_order_id;
  end if;

  update public.product_inventory pi
  set
    reserved_stock = greatest(pi.reserved_stock - src.qty, 0),
    updated_at = now()
  from (
    select
      oi.product_id,
      oi.variant_id,
      sum(oi.quantity)::int as qty
    from public.order_items oi
    where oi.order_id = p_order_id
      and coalesce(oi.is_digital, false) = false
    group by oi.product_id, oi.variant_id
  ) src
  where pi.product_id = src.product_id
    and pi.country_id = v_country_id
    and pi.variant_id is not distinct from src.variant_id;

  update public.orders
  set
    inventory_reserved = false,
    updated_at = now()
  where id = p_order_id;
end;
$function$;

-- ── auto_create_inventory ──
CREATE OR REPLACE FUNCTION public.auto_create_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_country_id uuid;
BEGIN
  IF NEW.type = 'رقمي' THEN RETURN NEW; END IF;
  SELECT id INTO v_country_id FROM countries WHERE is_active = true
    ORDER BY CASE WHEN code = 'EG' THEN 0 ELSE 1 END LIMIT 1;
  IF v_country_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO product_inventory (product_id, variant_id, country_id, stock, reserved_stock, min_stock)
  VALUES (NEW.id, NULL, v_country_id, 0, 0, 5)
  ON CONFLICT (product_id, variant_id, country_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;

-- ── auto_create_inventory_for_variant ──
CREATE OR REPLACE FUNCTION public.auto_create_inventory_for_variant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_country_id uuid;
BEGIN
  IF NEW.variant_type = 'رقمي' THEN RETURN NEW; END IF;
  SELECT id INTO v_country_id FROM countries WHERE is_active = true
    ORDER BY CASE WHEN code = 'EG' THEN 0 ELSE 1 END LIMIT 1;
  IF v_country_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO product_inventory (product_id, variant_id, country_id, stock, reserved_stock, min_stock)
  VALUES (NEW.product_id, NEW.id, v_country_id, 0, 0, 5)
  ON CONFLICT (product_id, variant_id, country_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;

-- ── product_variants_public ──
CREATE OR REPLACE VIEW public.product_variants_public AS
 SELECT pv.id AS variant_id,
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
            WHEN COALESCE(pvcp.base_price, pv.base_price, pvcp.price, pv.price) > COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price) THEN round((COALESCE(pvcp.base_price, pv.base_price, pvcp.price, pv.price) - COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price)) / COALESCE(pvcp.base_price, pv.base_price, pvcp.price, pv.price) * 100::numeric, 0)
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
  WHERE p.is_active = true AND COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price, 0::numeric) > 0::numeric;

-- ── products_public_catalog ──
CREATE OR REPLACE VIEW public.products_public_catalog AS
 WITH variant_prices AS (
         SELECT pv.product_id,
            co.id AS country_id,
            co.code AS country_code,
            co.currency,
            co.currency_symbol,
            min(
                CASE
                    WHEN COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price) > 0::numeric THEN COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price)
                    ELSE NULL::numeric
                END) AS min_price,
            max(
                CASE
                    WHEN COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price) > 0::numeric THEN COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price)
                    ELSE NULL::numeric
                END) AS max_price,
            min(COALESCE(pvcp.base_price, pv.base_price, pvcp.price, pv.price)) AS min_old_price,
            max(
                CASE
                    WHEN COALESCE(pvcp.sale_price, pv.sale_price) IS NOT NULL AND COALESCE(pvcp.base_price, pv.base_price) > COALESCE(pvcp.sale_price, pv.sale_price) AND COALESCE(pvcp.base_price, pv.base_price) > 0::numeric THEN round((COALESCE(pvcp.base_price, pv.base_price) - COALESCE(pvcp.sale_price, pv.sale_price)) / COALESCE(pvcp.base_price, pv.base_price) * 100::numeric, 0)
                    ELSE 0::numeric
                END) AS max_discount_pct,
            count(*) AS variant_count
           FROM product_variants pv
             JOIN countries co ON co.is_active = true
             LEFT JOIN product_variant_country_prices pvcp ON pvcp.variant_id = pv.id AND pvcp.country_id = co.id
          WHERE COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price, 0::numeric) > 0::numeric
          GROUP BY pv.product_id, co.id, co.code, co.currency, co.currency_symbol
        )
 SELECT p.id AS product_id,
    p.title,
    p.author,
    p.description,
    COALESCE(( SELECT pi2.url
           FROM product_images pi2
          WHERE pi2.product_id = p.id
          ORDER BY pi2.is_primary DESC, pi2.sort_order
         LIMIT 1), p.cover_url) AS main_image_url,
    p.cover_url,
    p.category_id,
    c.name AS category_name,
    c.slug AS category_slug,
    p.isbn,
    p.keywords,
    p.type,
    vp.country_id,
    vp.country_code,
    vp.currency,
    vp.currency_symbol,
    vp.min_price,
    vp.max_price,
    vp.min_price AS starting_price,
    vp.variant_count,
        CASE
            WHEN vp.min_old_price > vp.min_price THEN vp.min_old_price
            ELSE NULL::numeric
        END AS old_price,
    vp.min_price AS new_price,
        CASE
            WHEN vp.min_old_price > vp.min_price THEN round((vp.min_old_price - vp.min_price) / vp.min_old_price * 100::numeric, 0)
            ELSE 0::numeric
        END AS discount_percent,
    COALESCE(jsonb_agg(jsonb_build_object('id', pi.id, 'url', pi.url, 'alt_text', pi.alt_text, 'is_primary', pi.is_primary, 'sort_order', pi.sort_order) ORDER BY pi.is_primary DESC, pi.sort_order) FILTER (WHERE pi.id IS NOT NULL), '[]'::jsonb) AS images,
    p.created_at,
    vp.max_discount_pct
   FROM products p
     JOIN variant_prices vp ON vp.product_id = p.id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id
  WHERE p.is_active = true
  GROUP BY p.id, p.title, p.author, p.description, p.cover_url, p.category_id, c.name, c.slug, p.isbn, p.keywords, p.type, vp.country_id, vp.country_code, vp.currency, vp.currency_symbol, vp.min_price, vp.max_price, vp.min_old_price, vp.max_discount_pct, vp.variant_count, p.created_at;
