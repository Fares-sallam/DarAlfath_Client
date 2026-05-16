-- ═══════════════════════════════════════════════════════════════════
-- Pending Payments System (simplified)
--   - Holds cart + customer data in escrow during Paymob flow.
--   - Real `orders` rows are only created after payment is confirmed.
--   - Stock tracking is delegated to the existing schema (e.g. the
--     product_variants_public view or whichever mechanism the project
--     already uses). We do NOT touch stock columns here.
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

ALTER TABLE pending_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_pending_payments" ON pending_payments;
CREATE POLICY "service_role_full_pending_payments" ON pending_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Save a pending payment (no stock side-effects) ─────────────
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
  v_pending_id UUID;
BEGIN
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

-- ── 3. Cancel a pending payment (no stock release needed) ─────────
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

  UPDATE pending_payments
  SET status         = 'cancelled',
      failure_reason = p_reason,
      completed_at   = NOW()
  WHERE merchant_order_id = p_merchant_order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_pending_payment(TEXT, TEXT) TO service_role;

-- ── 4. Complete pending payment → create real order ────────────────
--    Delegates stock deduction to the existing `create_order_with_stock_deduction`
--    RPC so we don't reinvent (or break) the project's stock logic.
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
  v_rpc_result       JSONB;
  v_order_id         TEXT;
  v_coupon_id        UUID;
  v_discount         NUMERIC := 0;
  v_shipping         NUMERIC;
  v_subtotal         NUMERIC := 0;
  v_total            NUMERIC;
  v_coupon           RECORD;
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

  -- Compute subtotal from frozen items (price_per_item matches the existing RPC contract)
  SELECT COALESCE(SUM(
    COALESCE((it->>'price_per_item')::NUMERIC, (it->>'price')::NUMERIC, 0)
    * (it->>'quantity')::INT
  ), 0)
  INTO v_subtotal
  FROM jsonb_array_elements(v_pending.items) it;

  v_shipping := v_pending.shipping_cost;

  -- Apply coupon if any
  IF v_pending.coupon_code IS NOT NULL AND v_pending.coupon_code <> '' THEN
    SELECT * INTO v_coupon
    FROM coupons
    WHERE code = UPPER(TRIM(v_pending.coupon_code))
      AND is_active = true;

    IF FOUND THEN
      v_coupon_id := v_coupon.id;
      IF v_coupon.type = 'نسبة' THEN
        v_discount := ROUND(v_subtotal * v_coupon.value / 100, 2);
      ELSIF v_coupon.type = 'مبلغ ثابت' THEN
        v_discount := LEAST(v_coupon.value, v_subtotal);
      ELSIF v_coupon.type = 'شحن مجاني' THEN
        v_shipping := 0;
      END IF;
    END IF;
  END IF;

  v_total := GREATEST(v_subtotal - v_discount + v_shipping, 0);

  -- Delegate order creation (with stock deduction) to the existing RPC
  SELECT create_order_with_stock_deduction(
    p_user_id            := v_pending.user_id,
    p_country_id         := v_pending.country_id,
    p_payment_method_id  := v_pending.payment_method_id,
    p_shipping_cost      := v_shipping,
    p_shipping_address   := v_pending.shipping_address,
    p_notes              := v_pending.notes,
    p_items              := v_pending.items
  ) INTO v_rpc_result;

  v_order_id := v_rpc_result->>'id';

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   COALESCE(v_rpc_result->>'error', 'فشل إنشاء الطلب')
    );
  END IF;

  -- Update the freshly-created order with coupon + final totals + paid status
  UPDATE orders
  SET coupon_id       = v_coupon_id,
      discount_amount = v_discount,
      total_price     = v_total,
      payment_status  = 'paid'
  WHERE id = v_order_id;

  -- Bump coupon usage
  IF v_coupon_id IS NOT NULL THEN
    UPDATE coupons SET used_count = used_count + 1 WHERE id = v_coupon_id;
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

-- ── 5. Expire stale pending payments ───────────────────────────────
CREATE OR REPLACE FUNCTION expire_stale_pending_payments()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE pending_payments
  SET status         = 'expired',
      failure_reason = 'انتهت مدة الصلاحية',
      completed_at   = NOW()
  WHERE status = 'pending' AND expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION expire_stale_pending_payments() TO service_role;
