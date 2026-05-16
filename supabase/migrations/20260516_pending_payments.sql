-- ═══════════════════════════════════════════════════════════════════
-- Pending Payments System
--   - Holds cart + customer data in escrow during Paymob flow
--   - Real `orders` rows are only created after payment is confirmed
--   - Stock is reserved (not deducted) so it survives failures cleanly
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_order_id     TEXT UNIQUE NOT NULL,
  user_id               UUID,
  country_id            UUID REFERENCES countries(id),
  payment_method_id     UUID REFERENCES payment_methods(id),
  amount_cents          BIGINT NOT NULL CHECK (amount_cents >= 0),
  shipping_cost         NUMERIC NOT NULL DEFAULT 0,
  shipping_address      JSONB NOT NULL,
  notes                 TEXT,
  items                 JSONB NOT NULL,
  coupon_code           TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'completed', 'failed', 'expired', 'cancelled')),
  paymob_order_id       TEXT,
  paymob_transaction_id TEXT,
  resulting_order_id    TEXT,
  failure_reason        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_payments_merchant_order_id
  ON pending_payments (merchant_order_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_status_expires_at
  ON pending_payments (status, expires_at)
  WHERE status = 'pending';

-- RLS: only the service role has access — frontend goes through Edge Functions
ALTER TABLE pending_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_pending_payments" ON pending_payments;
CREATE POLICY "service_role_full_pending_payments" ON pending_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Reserve stock + insert pending_payment ─────────────────────
CREATE OR REPLACE FUNCTION create_pending_payment(
  p_merchant_order_id  TEXT,
  p_user_id            UUID,
  p_country_id         UUID,
  p_payment_method_id  UUID,
  p_amount_cents       BIGINT,
  p_shipping_cost      NUMERIC,
  p_shipping_address   JSONB,
  p_notes              TEXT,
  p_items              JSONB,
  p_coupon_code        TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_id   UUID;
  v_item         JSONB;
  v_variant_id   UUID;
  v_quantity     INT;
  v_is_digital   BOOLEAN;
  v_stock        INT;
BEGIN
  -- Validate + reserve stock for each physical item (atomic FOR UPDATE)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity   := (v_item->>'quantity')::INT;
    v_is_digital := COALESCE((v_item->>'is_digital')::BOOLEAN, false);

    IF NOT v_is_digital AND v_variant_id IS NOT NULL THEN
      SELECT stock INTO v_stock
      FROM product_variants
      WHERE id = v_variant_id
      FOR UPDATE;

      IF v_stock IS NOT NULL AND v_stock < v_quantity THEN
        RAISE EXCEPTION 'المخزون غير كافٍ — المتوفر: %, المطلوب: %', COALESCE(v_stock, 0), v_quantity;
      END IF;

      -- Reserve: move quantity from stock → reserved_stock
      UPDATE product_variants
      SET stock          = stock - v_quantity,
          reserved_stock = COALESCE(reserved_stock, 0) + v_quantity
      WHERE id = v_variant_id
        AND stock IS NOT NULL;
    END IF;
  END LOOP;

  -- Save the pending payment intent
  INSERT INTO pending_payments (
    merchant_order_id, user_id, country_id, payment_method_id,
    amount_cents, shipping_cost, shipping_address, notes, items, coupon_code
  ) VALUES (
    p_merchant_order_id, p_user_id, p_country_id, p_payment_method_id,
    p_amount_cents, p_shipping_cost, p_shipping_address, p_notes, p_items, p_coupon_code
  ) RETURNING id INTO v_pending_id;

  RETURN v_pending_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_pending_payment(
  TEXT, UUID, UUID, UUID, BIGINT, NUMERIC, JSONB, TEXT, JSONB, TEXT
) TO service_role;

-- ── 3. Release reserved stock (used by cancel + expire) ────────────
CREATE OR REPLACE FUNCTION release_pending_reservation(p_merchant_order_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items      JSONB;
  v_item       JSONB;
  v_variant_id UUID;
  v_quantity   INT;
  v_is_digital BOOLEAN;
BEGIN
  SELECT items INTO v_items
  FROM pending_payments
  WHERE merchant_order_id = p_merchant_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity   := (v_item->>'quantity')::INT;
    v_is_digital := COALESCE((v_item->>'is_digital')::BOOLEAN, false);

    IF NOT v_is_digital AND v_variant_id IS NOT NULL THEN
      UPDATE product_variants
      SET stock          = stock + v_quantity,
          reserved_stock = GREATEST(COALESCE(reserved_stock, 0) - v_quantity, 0)
      WHERE id = v_variant_id
        AND stock IS NOT NULL;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION release_pending_reservation(TEXT) TO service_role;

-- ── 4. Cancel a pending payment (release stock) ───────────────────
CREATE OR REPLACE FUNCTION cancel_pending_payment(
  p_merchant_order_id TEXT,
  p_reason            TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  SELECT status INTO v_current_status
  FROM pending_payments
  WHERE merchant_order_id = p_merchant_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود');
  END IF;

  IF v_current_status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب تم بالفعل');
  END IF;

  IF v_current_status IN ('failed', 'cancelled', 'expired') THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  -- Release stock
  PERFORM release_pending_reservation(p_merchant_order_id);

  UPDATE pending_payments
  SET status         = 'cancelled',
      failure_reason = p_reason,
      completed_at   = NOW()
  WHERE merchant_order_id = p_merchant_order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_pending_payment(TEXT, TEXT) TO service_role;

-- ── 5. Complete pending payment → create real order ────────────────
CREATE OR REPLACE FUNCTION complete_pending_payment(
  p_merchant_order_id     TEXT,
  p_paymob_order_id       TEXT,
  p_paymob_transaction_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending          pending_payments%ROWTYPE;
  v_item             JSONB;
  v_variant_id       UUID;
  v_quantity         INT;
  v_is_digital       BOOLEAN;
  v_order_id         TEXT;
  v_subtotal         NUMERIC := 0;
  v_total            NUMERIC;
  v_coupon           coupons%ROWTYPE;
  v_discount_amount  NUMERIC := 0;
  v_shipping_cost    NUMERIC;
BEGIN
  -- Idempotency: if already completed, return the existing order
  SELECT * INTO v_pending
  FROM pending_payments
  WHERE merchant_order_id = p_merchant_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود');
  END IF;

  IF v_pending.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already', true,
      'order_id', v_pending.resulting_order_id
    );
  END IF;

  IF v_pending.status NOT IN ('pending') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'الطلب في حالة لا تسمح بالإتمام: ' || v_pending.status
    );
  END IF;

  -- Compute subtotal from frozen items (price was captured at intent time)
  SELECT COALESCE(SUM((it->>'price')::NUMERIC * (it->>'quantity')::INT), 0)
  INTO v_subtotal
  FROM jsonb_array_elements(v_pending.items) it;

  v_shipping_cost := v_pending.shipping_cost;

  -- Apply coupon if any
  IF v_pending.coupon_code IS NOT NULL AND v_pending.coupon_code <> '' THEN
    SELECT * INTO v_coupon
    FROM coupons
    WHERE code = UPPER(TRIM(v_pending.coupon_code))
      AND is_active = true;

    IF FOUND THEN
      IF v_coupon.type = 'نسبة' THEN
        v_discount_amount := ROUND(v_subtotal * v_coupon.value / 100, 2);
      ELSIF v_coupon.type = 'مبلغ ثابت' THEN
        v_discount_amount := LEAST(v_coupon.value, v_subtotal);
      ELSIF v_coupon.type = 'شحن مجاني' THEN
        v_shipping_cost := 0;
      END IF;
    END IF;
  END IF;

  v_total := GREATEST(v_subtotal - v_discount_amount + v_shipping_cost, 0);

  -- Convert reservations → real deductions:
  -- The reservation already moved stock → reserved_stock. We now just remove the reservation
  -- (the stock has already been deducted). For physical items, reserved_stock -= quantity.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_pending.items) LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity   := (v_item->>'quantity')::INT;
    v_is_digital := COALESCE((v_item->>'is_digital')::BOOLEAN, false);

    IF NOT v_is_digital AND v_variant_id IS NOT NULL THEN
      UPDATE product_variants
      SET reserved_stock = GREATEST(COALESCE(reserved_stock, 0) - v_quantity, 0)
      WHERE id = v_variant_id;
    END IF;
  END LOOP;

  -- Use the merchant_order_id as the order's id (consistent reference)
  v_order_id := v_pending.merchant_order_id;

  INSERT INTO orders (
    id, user_id, country_id, payment_method_id,
    status, payment_status, total_price, shipping_cost, discount_amount,
    shipping_address, notes,
    coupon_id,
    created_at, updated_at
  ) VALUES (
    v_order_id, v_pending.user_id, v_pending.country_id, v_pending.payment_method_id,
    'pending',                -- new order, awaiting fulfillment
    'paid',                   -- payment is confirmed at this point
    v_total, v_shipping_cost, v_discount_amount,
    v_pending.shipping_address, v_pending.notes,
    v_coupon.id,
    NOW(), NOW()
  );

  -- Insert order_items
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_pending.items) LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id, quantity,
      price_per_item, discount_per_item, is_digital
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'variant_id')::UUID,
      (v_item->>'quantity')::INT,
      (v_item->>'price')::NUMERIC,
      0,
      COALESCE((v_item->>'is_digital')::BOOLEAN, false)
    );
  END LOOP;

  -- Bump coupon usage if any
  IF v_coupon.id IS NOT NULL THEN
    UPDATE coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;
  END IF;

  -- Mark pending as completed
  UPDATE pending_payments
  SET status                = 'completed',
      paymob_order_id       = p_paymob_order_id,
      paymob_transaction_id = p_paymob_transaction_id,
      resulting_order_id    = v_order_id,
      completed_at          = NOW()
  WHERE id = v_pending.id;

  RETURN jsonb_build_object(
    'success',  true,
    'order_id', v_order_id,
    'total',    v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_pending_payment(TEXT, TEXT, TEXT) TO service_role;

-- ── 6. Expire stale pending payments (call from cron OR on-demand) ─
CREATE OR REPLACE FUNCTION expire_stale_pending_payments()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_row   RECORD;
BEGIN
  FOR v_row IN
    SELECT merchant_order_id
    FROM pending_payments
    WHERE status = 'pending' AND expires_at < NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM release_pending_reservation(v_row.merchant_order_id);
    UPDATE pending_payments
    SET status         = 'expired',
        failure_reason = 'انتهت مدة الصلاحية',
        completed_at   = NOW()
    WHERE merchant_order_id = v_row.merchant_order_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION expire_stale_pending_payments() TO service_role;
