-- ═══════════════════════════════════════════════════════════════════════
--  release_coupon — reverse a claim_coupon when payment is cancelled
--  ─────────────────────────────────────────────────────────────────────
--  Atomically decrements used_count (never below 0).
--  Called when a Paymob pending_payment is cancelled/expired after the
--  coupon was already claimed during initiate-paymob-payment.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.release_coupon(p_coupon_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  IF p_coupon_code IS NULL OR p_coupon_code = '' THEN
    RETURN FALSE;
  END IF;

  UPDATE coupons
     SET used_count = GREATEST(COALESCE(used_count, 0) - 1, 0)
   WHERE code = UPPER(TRIM(p_coupon_code))
     AND COALESCE(used_count, 0) > 0;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_coupon(TEXT) TO service_role;
