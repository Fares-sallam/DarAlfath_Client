-- ═══════════════════════════════════════════════════════════════════════
-- Book bundles (مجموعات الكتب)
--
-- A bundle is an ordinary product (is_bundle = true) with exactly one
-- physical variant. The cart, checkout and edge functions treat it like any
-- other variant. It has NO product_inventory rows: its stock is always
-- derived from its books (bundle_available_stock), and ordering it
-- reserves/deducts the books' own inventory. A book sold inside a bundle
-- therefore can never also be oversold on its own.
--
-- Every function changed here starts from its live definition, recorded
-- unchanged in 20260924_baseline_live_stock_objects.sql just before this.
-- For orders without bundles each one behaves exactly as before.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Schema ─────────────────────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_bundle boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.bundle_items (
  bundle_variant_id    uuid    NOT NULL,
  component_variant_id uuid    NOT NULL,
  -- Filled in by bundle_items_validate from the variant ids above (the
  -- source of truth). Kept so the dashboard can embed titles and find
  -- "which bundles contain this book" without an extra hop.
  bundle_product_id    uuid    NOT NULL,
  component_product_id uuid    NOT NULL,
  quantity             integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  sort_order           integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bundle_items_pkey PRIMARY KEY (bundle_variant_id, component_variant_id),
  CONSTRAINT bundle_items_not_self CHECK (bundle_variant_id <> component_variant_id),
  CONSTRAINT bundle_items_bundle_variant_id_fkey
    FOREIGN KEY (bundle_variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE,
  CONSTRAINT bundle_items_bundle_product_id_fkey
    FOREIGN KEY (bundle_product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  -- RESTRICT: a book can't disappear out from under a bundle that sells it.
  -- The dashboard checks this first and explains (useDeleteProduct).
  CONSTRAINT bundle_items_component_variant_id_fkey
    FOREIGN KEY (component_variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  CONSTRAINT bundle_items_component_product_id_fkey
    FOREIGN KEY (component_product_id) REFERENCES public.products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS bundle_items_component_variant_idx ON public.bundle_items (component_variant_id);
CREATE INDEX IF NOT EXISTS bundle_items_component_product_idx ON public.bundle_items (component_product_id);
CREATE INDEX IF NOT EXISTS bundle_items_bundle_product_idx   ON public.bundle_items (bundle_product_id);

-- What a bundle order line actually took from inventory, captured at order
-- time. Delivery/cancellation finalize/release from this snapshot, so
-- editing the bundle between ordering and delivery can't deduct the wrong
-- books. Title/variant name are copied too, with no FKs to the books:
-- order history keeps what was really packed, and deleting a book later is
-- never blocked by an old order.
CREATE TABLE IF NOT EXISTS public.order_item_components (
  id            bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_item_id uuid    NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_id    uuid    NOT NULL,
  variant_id    uuid    NOT NULL,
  -- Total for the line: count in the bundle × bundles ordered.
  quantity      integer NOT NULL CHECK (quantity > 0),
  title         text    NOT NULL,
  variant_name  text
);

CREATE INDEX IF NOT EXISTS order_item_components_item_idx ON public.order_item_components (order_item_id);

-- ── 2. bundle_items integrity ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bundle_items_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_bundle_product      uuid;
  v_bundle_is_bundle    boolean;
  v_component_product   uuid;
  v_component_type      text;
  v_component_is_bundle boolean;
BEGIN
  SELECT pv.product_id, p.is_bundle
    INTO v_bundle_product, v_bundle_is_bundle
    FROM product_variants pv JOIN products p ON p.id = pv.product_id
   WHERE pv.id = NEW.bundle_variant_id;

  SELECT pv.product_id, pv.variant_type, p.is_bundle
    INTO v_component_product, v_component_type, v_component_is_bundle
    FROM product_variants pv JOIN products p ON p.id = pv.product_id
   WHERE pv.id = NEW.component_variant_id;

  IF v_bundle_product IS NULL OR v_component_product IS NULL THEN
    RAISE EXCEPTION 'نسخة غير موجودة' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT v_bundle_is_bundle THEN
    RAISE EXCEPTION 'المنتج ده مش مجموعة' USING ERRCODE = 'check_violation';
  END IF;
  IF v_component_is_bundle THEN
    RAISE EXCEPTION 'ممنوع تحط مجموعة جوه مجموعة' USING ERRCODE = 'check_violation';
  END IF;
  IF v_component_type = 'رقمي' THEN
    RAISE EXCEPTION 'المجموعة بتتكون من نسخ ورقية بس' USING ERRCODE = 'check_violation';
  END IF;

  NEW.bundle_product_id    := v_bundle_product;
  NEW.component_product_id := v_component_product;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bundle_items_validate ON public.bundle_items;
CREATE TRIGGER bundle_items_validate
  BEFORE INSERT OR UPDATE ON public.bundle_items
  FOR EACH ROW EXECUTE FUNCTION public.bundle_items_validate();

-- The dashboard's only write path: replace a bundle's books in one
-- transaction (a half-applied delete+insert would leave it with no books).
-- SECURITY INVOKER: bundle_items' own RLS decides who may call it.
CREATE OR REPLACE FUNCTION public.set_bundle_items(p_bundle_variant_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM bundle_items WHERE bundle_variant_id = p_bundle_variant_id;

  INSERT INTO bundle_items (bundle_variant_id, component_variant_id, bundle_product_id, component_product_id, quantity, sort_order)
  SELECT p_bundle_variant_id,
         (t.item ->> 'component_variant_id')::uuid,
         -- placeholders; bundle_items_validate overwrites both from the variant ids
         '00000000-0000-0000-0000-000000000000'::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid,
         GREATEST(1, COALESCE((t.item ->> 'quantity')::int, 1)),
         COALESCE((t.item ->> 'sort_order')::int, t.ord::int - 1)
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord);

  IF (SELECT count(*) FROM bundle_items WHERE bundle_variant_id = p_bundle_variant_id) < 2 THEN
    RAISE EXCEPTION 'المجموعة لازم فيها كتابين مختلفين على الأقل' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_bundle_items(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_bundle_items(uuid, jsonb) TO authenticated;

-- ── 3. Derived stock ──────────────────────────────────────────────────

-- How many whole bundles the books' current stock can make in a country.
-- A book with no inventory row there counts as 0, and so does a bundle with
-- no books. One source of truth: the public view and the order function
-- both use this rule, and the dashboard mirrors it client-side
-- (src/lib/bundles.ts) for the live form preview.
CREATE OR REPLACE FUNCTION public.bundle_available_stock(p_bundle_variant_id uuid, p_country_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(MIN(
           FLOOR(GREATEST(COALESCE(pi.stock, 0) - COALESCE(pi.reserved_stock, 0), 0)::numeric / bi.quantity)
         ), 0)::integer
    FROM bundle_items bi
    LEFT JOIN product_inventory pi
      ON pi.variant_id = bi.component_variant_id
     AND pi.product_id = bi.component_product_id
     AND pi.country_id = p_country_id
   WHERE bi.bundle_variant_id = p_bundle_variant_id;
$$;

GRANT EXECUTE ON FUNCTION public.bundle_available_stock(uuid, uuid) TO anon, authenticated;

-- An order's physical inventory lines with bundles expanded into their
-- books (from the snapshot), aggregated per copy. The same book can arrive
-- on its own and inside a bundle (or two bundles) in one order, and
-- UPDATE … FROM applies only ONE of several matching rows per target row,
-- so un-aggregated rows would silently drop part of the quantity.
-- orders.id is text ('ORD-…').
CREATE OR REPLACE FUNCTION public.order_inventory_lines(p_order_id text)
RETURNS TABLE (product_id uuid, variant_id uuid, quantity integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT x.product_id, x.variant_id, SUM(x.quantity)::integer
    FROM (
      SELECT oi.product_id, oi.variant_id, oi.quantity
        FROM order_items oi
       WHERE oi.order_id = p_order_id
         AND oi.is_digital = FALSE
         AND NOT EXISTS (SELECT 1 FROM order_item_components c WHERE c.order_item_id = oi.id)
      UNION ALL
      SELECT c.product_id, c.variant_id, c.quantity
        FROM order_item_components c
        JOIN order_items oi ON oi.id = c.order_item_id
       WHERE oi.order_id = p_order_id
    ) x
   GROUP BY x.product_id, x.variant_id;
$$;

REVOKE EXECUTE ON FUNCTION public.order_inventory_lines(text) FROM PUBLIC, anon, authenticated;

-- ── 4. Order creation ────────────────────────────────────────────────
-- Changes vs. the live version (see the baseline file):
--   • Phase 1 checks stock for the whole order's demand summed per copy,
--     with each bundle line expanded into its books, locking rows in
--     variant_id order. The error texts for non-bundle lines are unchanged;
--     a shortage inside a bundle names the book and the bundle.
--   • Phase 4 snapshots each bundle line's books into order_item_components.
--   • Phase 5 reserves once, from order_inventory_lines(), the exact lines
--     delivery/cancellation later finalize/release.
-- Pricing, totals and the order row itself are untouched.

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
  v_is_bundle      BOOLEAN;
  v_net_stock      INT;
  v_order_item_id  UUID;
  v_need           RECORD;
BEGIN
  v_country_uuid := CASE
    WHEN p_country_id IS NULL OR TRIM(p_country_id) = '' THEN NULL
    ELSE p_country_id::UUID
  END;

  -- ── Phase 1: التحقق من المخزون ──
  -- Freeze the composition of every bundle in this order until commit, so
  -- the books checked here are exactly the ones snapshotted and reserved
  -- below, even if an admin edits the bundle at the same moment.
  PERFORM 1
     FROM bundle_items bi
    WHERE bi.bundle_variant_id IN (SELECT (e->>'variant_id')::UUID FROM jsonb_array_elements(p_items) e)
      FOR SHARE;

  -- A bundle with no books would sell without reserving anything.
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_items) e
      JOIN product_variants pv ON pv.id = (e->>'variant_id')::UUID
      JOIN products p ON p.id = pv.product_id AND p.is_bundle
     WHERE NOT EXISTS (SELECT 1 FROM bundle_items bi WHERE bi.bundle_variant_id = pv.id)
  ) THEN
    RAISE EXCEPTION 'هذه المجموعة غير متاحة حالياً. يرجى التواصل مع الدار.';
  END IF;

  FOR v_need IN
    WITH lines AS (
      SELECT (e->>'variant_id')::UUID AS variant_id,
             (e->>'product_id')::UUID AS product_id,
             COALESCE((e->>'quantity')::INT, 1) AS quantity
        FROM jsonb_array_elements(p_items) e
    ),
    demand AS (
      -- a physical copy ordered on its own
      SELECT l.product_id, l.variant_id, l.quantity, NULL::TEXT AS bundle_title
        FROM lines l
        LEFT JOIN product_variants pv ON pv.id = l.variant_id
        LEFT JOIN products p ON p.id = pv.product_id
       WHERE COALESCE(pv.variant_type, '') <> 'رقمي'
         AND NOT COALESCE(p.is_bundle, FALSE)
      UNION ALL
      -- a bundle, as its books
      SELECT bi.component_product_id, bi.component_variant_id, bi.quantity * l.quantity, p.title
        FROM lines l
        JOIN product_variants pv ON pv.id = l.variant_id
        JOIN products p ON p.id = pv.product_id AND p.is_bundle
        JOIN bundle_items bi ON bi.bundle_variant_id = l.variant_id
    )
    SELECT d.product_id,
           d.variant_id,
           SUM(d.quantity)::INT AS qty,
           string_agg(DISTINCT d.bundle_title, '، ') AS bundle_titles,
           (SELECT pr.title FROM products pr WHERE pr.id = d.product_id) AS book_title
      FROM demand d
     GROUP BY d.product_id, d.variant_id
     ORDER BY d.variant_id
  LOOP
    SELECT GREATEST(COALESCE(pi.stock,0) - COALESCE(pi.reserved_stock,0), 0)
      INTO v_net_stock
      FROM product_inventory pi
     WHERE pi.variant_id = v_need.variant_id
       AND pi.product_id = v_need.product_id
       AND (v_country_uuid IS NULL OR pi.country_id = v_country_uuid)
     ORDER BY pi.country_id LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN
      IF v_need.bundle_titles IS NULL THEN
        RAISE EXCEPTION 'لا يوجد مخزون مسجل لهذه النسخة. يرجى التواصل مع الدار.';
      END IF;
      RAISE EXCEPTION 'لا يوجد مخزون مسجل لكتاب «%» ضمن «%». يرجى التواصل مع الدار.',
        v_need.book_title, v_need.bundle_titles;
    END IF;
    IF v_net_stock < v_need.qty THEN
      IF v_need.bundle_titles IS NULL THEN
        RAISE EXCEPTION 'الكمية المطلوبة (%) غير متوفرة. المتاح حالياً: % نسخة.',
          v_need.qty, v_net_stock;
      END IF;
      RAISE EXCEPTION 'الكمية المطلوبة من «%» ضمن «%» (%) غير متوفرة. المتاح حالياً: % نسخة.',
        v_need.book_title, v_need.bundle_titles, v_need.qty, v_net_stock;
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
    inventory_reserved, inventory_finalized
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
    TRUE, FALSE
  )
  RETURNING id INTO v_order_id;

  -- ── Phase 4: عناصر الطلب (+ محتوى المجموعات) ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity   := COALESCE((v_item->>'quantity')::INT, 1);
    v_price      := COALESCE((v_item->>'price_per_item')::NUMERIC, 0);

    SELECT COALESCE(pv.variant_type = 'رقمي', FALSE), COALESCE(p.is_bundle, FALSE)
      INTO v_is_digital, v_is_bundle
      FROM product_variants pv JOIN products p ON p.id = pv.product_id
     WHERE pv.id = v_variant_id LIMIT 1;
    IF NOT FOUND THEN v_is_digital := FALSE; v_is_bundle := FALSE; END IF;

    INSERT INTO order_items (
      order_id, product_id, variant_id, quantity,
      price_per_item, discount_per_item, is_digital
    )
    VALUES (
      v_order_id, v_product_id, v_variant_id,
      v_quantity, v_price, 0, v_is_digital
    )
    RETURNING id INTO v_order_item_id;

    IF v_is_bundle THEN
      INSERT INTO order_item_components (order_item_id, product_id, variant_id, quantity, title, variant_name)
      SELECT v_order_item_id, bi.component_product_id, bi.component_variant_id,
             bi.quantity * v_quantity, cp.title, cv.variant_name
        FROM bundle_items bi
        JOIN products cp ON cp.id = bi.component_product_id
        JOIN product_variants cv ON cv.id = bi.component_variant_id
       WHERE bi.bundle_variant_id = v_variant_id
       ORDER BY bi.sort_order;
    END IF;
  END LOOP;

  -- ── Phase 5: حجز المخزون ──
  UPDATE product_inventory pi
     SET reserved_stock = COALESCE(pi.reserved_stock,0) + l.quantity,
         updated_at = NOW()
    FROM order_inventory_lines(v_order_id) l
   WHERE pi.variant_id = l.variant_id
     AND pi.product_id = l.product_id
     AND (v_country_uuid IS NULL OR pi.country_id = v_country_uuid);

  RETURN jsonb_build_object('id', v_order_id, 'created_at', NOW());
END;
$function$;

-- ── 5. Delivery / cancellation ───────────────────────────────────────
-- Same as live, except both UPDATEs read order_inventory_lines() instead of
-- raw order_items. Orders without bundles yield exactly the same lines.

CREATE OR REPLACE FUNCTION public.manage_stock_on_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN

  -- ── إلغاء أو استرداد → تحرير الحجز فقط إن كان الطلب محجوزاً ───────────
  IF NEW.status IN ('ملغي', 'مرتجع')
     AND OLD.status NOT IN ('ملغي', 'مرتجع')
     AND COALESCE(OLD.inventory_reserved, FALSE) = TRUE
  THEN
    UPDATE public.product_inventory pi
    SET    reserved_stock = GREATEST(0, COALESCE(pi.reserved_stock, 0) - l.quantity),
           updated_at     = NOW()
    FROM   public.order_inventory_lines(NEW.id) l
    WHERE  l.variant_id = pi.variant_id
      AND  l.product_id = pi.product_id
      AND  (NEW.country_id IS NULL OR pi.country_id = NEW.country_id);

    UPDATE public.orders
    SET    inventory_reserved = FALSE
    WHERE  id = NEW.id;
  END IF;

  -- ── تم التوصيل → خصم نهائي من stock + تحرير reserved_stock ─────────────
  IF NEW.status = 'تم التوصيل'
     AND OLD.status NOT IN ('تم التوصيل', 'ملغي', 'مرتجع')
     AND COALESCE(OLD.inventory_reserved, FALSE) = TRUE
  THEN
    UPDATE public.product_inventory pi
    SET    stock          = GREATEST(0, COALESCE(pi.stock, 0) - l.quantity),
           reserved_stock = GREATEST(0, COALESCE(pi.reserved_stock, 0) - l.quantity),
           updated_at     = NOW()
    FROM   public.order_inventory_lines(NEW.id) l
    WHERE  l.variant_id = pi.variant_id
      AND  l.product_id = pi.product_id
      AND  (NEW.country_id IS NULL OR pi.country_id = NEW.country_id);

    UPDATE public.orders
    SET    inventory_reserved  = FALSE,
           inventory_finalized = TRUE
    WHERE  id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Not called by any app code today, but kept correct for bundle orders:
-- same logic as live, with the per-copy lines taken from
-- order_inventory_lines() instead of raw order_items.

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

  select count(*)
  into v_bad_rows
  from public.order_inventory_lines(p_order_id) n
  join public.product_inventory pi
    on pi.product_id = n.product_id
   and pi.country_id = v_country_id
   and pi.variant_id is not distinct from n.variant_id
  where pi.stock < n.quantity
     or pi.reserved_stock < n.quantity;

  if v_bad_rows > 0 then
    raise exception 'Inventory consistency check failed for order %', p_order_id;
  end if;

  update public.product_inventory pi
  set
    stock = pi.stock - src.quantity,
    reserved_stock = greatest(pi.reserved_stock - src.quantity, 0),
    updated_at = now()
  from public.order_inventory_lines(p_order_id) src
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
    reserved_stock = greatest(pi.reserved_stock - src.quantity, 0),
    updated_at = now()
  from public.order_inventory_lines(p_order_id) src
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

-- ── 6. No inventory rows for bundles ─────────────────────────────────
-- Same as live, plus one early return: these triggers create an empty
-- inventory row for every new physical product/variant, which for a bundle
-- would be a stock field that means nothing.

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
  IF NEW.is_bundle THEN RETURN NEW; END IF;
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
  IF EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND is_bundle) THEN RETURN NEW; END IF;
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

-- ── 7. Keep a bundle's derived numbers true ──────────────────────────
-- Stored on the bundle's own variant, not only computed in a view: the
-- checkout edge functions read product_variants.weight_kg / price directly,
-- and the storefront's existing base-vs-sale discount display then works
-- for bundles unchanged.
--   weight_kg  = Σ book weight × qty          (shipping)
--   base_price = Σ book selling price × qty   (سعر البناء, struck through)
--   cost_price = Σ book cost × qty            (profit analytics)
-- Selling price uses the storefront views' exact precedence, so سعر البناء
-- is exactly what the customer would pay for the books one by one.

CREATE OR REPLACE FUNCTION public.refresh_bundle_derived(p_bundle_variant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE product_variants b
     SET weight_kg  = s.weight_kg,
         base_price = s.base_price,
         cost_price = s.cost_price
    FROM (
      SELECT SUM(COALESCE(c.weight_kg, 0.3) * bi.quantity)                   AS weight_kg,
             SUM(COALESCE(c.sale_price, c.price, 0) * bi.quantity)          AS base_price,
             SUM(COALESCE(c.cost_price, 0) * bi.quantity)                   AS cost_price
        FROM bundle_items bi
        JOIN product_variants c ON c.id = bi.component_variant_id
       WHERE bi.bundle_variant_id = p_bundle_variant_id
    ) s
   WHERE b.id = p_bundle_variant_id
     AND s.weight_kg IS NOT NULL;

  UPDATE product_variant_country_prices bcp
     SET base_price = s.base_price,
         cost_price = s.cost_price
    FROM (
      SELECT own.country_id,
             SUM(COALESCE(ccp.sale_price, c.sale_price, ccp.price, c.price, 0) * bi.quantity) AS base_price,
             SUM(COALESCE(ccp.cost_price, c.cost_price, 0) * bi.quantity)                     AS cost_price
        FROM product_variant_country_prices own
        JOIN bundle_items bi ON bi.bundle_variant_id = own.variant_id
        JOIN product_variants c ON c.id = bi.component_variant_id
        LEFT JOIN product_variant_country_prices ccp
          ON ccp.variant_id = bi.component_variant_id AND ccp.country_id = own.country_id
       WHERE own.variant_id = p_bundle_variant_id
       GROUP BY own.country_id
    ) s
   WHERE bcp.variant_id = p_bundle_variant_id
     AND bcp.country_id = s.country_id;

  -- Product-level summary, which analytics reads for cost.
  UPDATE products p
     SET cost_price = pv.cost_price,
         base_price = pv.base_price
    FROM product_variants pv
   WHERE pv.id = p_bundle_variant_id
     AND p.id = pv.product_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_bundle_derived(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bundle_items_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM refresh_bundle_derived(NEW.bundle_variant_id); END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN PERFORM refresh_bundle_derived(OLD.bundle_variant_id); END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bundle_items_after_change ON public.bundle_items;
CREATE TRIGGER bundle_items_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.bundle_items
  FOR EACH ROW EXECUTE FUNCTION public.bundle_items_after_change();

-- A book's price/weight/cost changed → refresh every bundle containing it.
-- Terminates: refreshing updates the bundle's own variant, which is never
-- itself a component (no bundles inside bundles), so the next pass finds
-- nothing.
CREATE OR REPLACE FUNCTION public.refresh_bundles_containing_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_variant uuid;
  r record;
BEGIN
  IF TG_TABLE_NAME = 'product_variants' THEN
    v_variant := NEW.id;                -- UPDATE only (see trigger below)
  ELSIF TG_OP = 'DELETE' THEN
    v_variant := OLD.variant_id;
  ELSE
    v_variant := NEW.variant_id;
  END IF;

  FOR r IN SELECT DISTINCT bundle_variant_id FROM bundle_items WHERE component_variant_id = v_variant LOOP
    PERFORM refresh_bundle_derived(r.bundle_variant_id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS product_variants_refresh_bundles ON public.product_variants;
CREATE TRIGGER product_variants_refresh_bundles
  AFTER UPDATE OF weight_kg, price, sale_price, cost_price ON public.product_variants
  FOR EACH ROW
  WHEN (OLD.weight_kg  IS DISTINCT FROM NEW.weight_kg
     OR OLD.price      IS DISTINCT FROM NEW.price
     OR OLD.sale_price IS DISTINCT FROM NEW.sale_price
     OR OLD.cost_price IS DISTINCT FROM NEW.cost_price)
  EXECUTE FUNCTION public.refresh_bundles_containing_variant();

DROP TRIGGER IF EXISTS pvcp_refresh_bundles ON public.product_variant_country_prices;
CREATE TRIGGER pvcp_refresh_bundles
  AFTER INSERT OR UPDATE OR DELETE ON public.product_variant_country_prices
  FOR EACH ROW EXECUTE FUNCTION public.refresh_bundles_containing_variant();

-- ── 8. Public read paths ─────────────────────────────────────────────

-- Same as live, plus one branch in each stock CASE: a bundle's stock is
-- its books' (bundle_available_stock), never its own. Called only for
-- bundle rows.
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
            WHEN p.is_bundle THEN public.bundle_available_stock(pv.id, co.id) > 0
            WHEN (COALESCE(pi.stock, 0) - COALESCE(pi.reserved_stock, 0)) > 0 THEN true
            ELSE false
        END AS is_available,
        CASE
            WHEN pv.variant_type = 'رقمي'::text THEN NULL::integer
            WHEN p.is_bundle THEN public.bundle_available_stock(pv.id, co.id)
            ELSE GREATEST(COALESCE(pi.stock, 0) - COALESCE(pi.reserved_stock, 0), 0)
        END AS available_stock,
    pv.weight_kg
   FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     JOIN countries co ON co.is_active = true
     LEFT JOIN product_variant_country_prices pvcp ON pvcp.variant_id = pv.id AND pvcp.country_id = co.id
     LEFT JOIN product_inventory pi ON pi.product_id = pv.product_id AND pi.variant_id = pv.id AND pi.country_id = co.id
  WHERE p.is_active = true AND COALESCE(pvcp.sale_price, pv.sale_price, pvcp.price, pv.price, 0::numeric) > 0::numeric;

-- Same as live, plus is_bundle (appended, as CREATE OR REPLACE VIEW requires).
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
    vp.max_discount_pct,
    p.is_bundle
   FROM products p
     JOIN variant_prices vp ON vp.product_id = p.id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id
  WHERE p.is_active = true
  GROUP BY p.id, p.title, p.author, p.description, p.cover_url, p.category_id, c.name, c.slug, p.isbn, p.keywords, p.type, vp.country_id, vp.country_code, vp.currency, vp.currency_symbol, vp.min_price, vp.max_price, vp.min_old_price, vp.max_discount_pct, vp.variant_count, p.created_at, p.is_bundle;

-- The books inside each visible bundle, for the bundle's page. Includes
-- books hidden from sale on their own, which the public catalog leaves out.
CREATE OR REPLACE VIEW public.bundle_contents_public AS
SELECT bi.bundle_product_id,
       bi.bundle_variant_id,
       bi.component_product_id AS product_id,
       bi.component_variant_id AS variant_id,
       bi.quantity,
       bi.sort_order,
       p.title,
       p.author,
       p.cover_url,
       p.is_active,
       pv.variant_name
  FROM bundle_items bi
  JOIN products p          ON p.id  = bi.component_product_id
  JOIN product_variants pv ON pv.id = bi.component_variant_id
  JOIN products bp         ON bp.id = bi.bundle_product_id
 WHERE bp.is_active = true;

GRANT SELECT ON public.bundle_contents_public TO anon, authenticated;

-- ── 9. RLS (same predicate as products / product_variants / order_items) ──

ALTER TABLE public.bundle_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isadmin_full_bundle_items ON public.bundle_items;
CREATE POLICY isadmin_full_bundle_items ON public.bundle_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Written only by the SECURITY DEFINER order function, and read-only for
-- staff (the order page's packing list): delivery/cancellation finalize or
-- release from these rows, so nobody should be able to edit them.
ALTER TABLE public.order_item_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isadmin_read_order_item_components ON public.order_item_components;
CREATE POLICY isadmin_read_order_item_components ON public.order_item_components
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- New table, columns and relationships → refresh PostgREST's schema cache.
NOTIFY pgrst, 'reload schema';

COMMIT;
