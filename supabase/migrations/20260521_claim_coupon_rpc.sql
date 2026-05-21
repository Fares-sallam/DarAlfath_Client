-- ═══════════════════════════════════════════════════════════════════════
--  claim_coupon — atomic coupon usage increment
--  ─────────────────────────────────────────────────────────────────────
--  Atomically increments used_count using DB-side `used_count + 1`
--  (never a stale JS variable).  Returns TRUE if the coupon was claimed,
--  FALSE if it's exhausted (used_count >= max_uses).
--
--  Called by:  create-storefront-order  (COD flow)
--             initiate-paymob-payment   (Paymob flow — reserve coupon)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_coupon(p_coupon_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE coupons
     SET used_count = COALESCE(used_count, 0) + 1
   WHERE id = p_coupon_id
     AND (max_uses IS NULL OR COALESCE(used_count, 0) < max_uses);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- Only Edge Functions (service_role) should call this
GRANT EXECUTE ON FUNCTION public.claim_coupon(UUID) TO service_role;
