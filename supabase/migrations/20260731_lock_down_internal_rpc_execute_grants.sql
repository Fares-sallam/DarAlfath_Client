-- ══════════════════════════════════════════════════════════════════════════
-- CRITICAL: internal payment/coupon/stock RPCs were callable directly by any
-- anon or authenticated client via PostgREST's /rpc/ endpoint, completely
-- bypassing every protection that lives in the Edge Functions layer (real
-- price re-verification from product_variants, Turnstile, rate limiting,
-- Paymob transaction_inquiry verification, digital-item-via-COD blocking).
--
-- Root cause: every migration below correctly added
--   GRANT EXECUTE ON FUNCTION ... TO service_role;
-- intending these to be internal-only, but never paired it with
--   REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and GRANT
-- only ever *adds* privileges — it never removes the implicit PUBLIC grant.
-- anon/authenticated are ordinary roles and inherit PUBLIC's privileges, so
-- both retained the ability to call these functions the whole time.
--
-- Confirmed live and reproducible before this fix (2026-07-31):
--   • anon could call create_order_with_stock_deduction directly and create
--     a real row in `orders` (id ORD-20260731-6d9cca — see cleanup note in
--     the security report) with self-declared items/prices, bypassing the
--     real-price recheck that only exists in the Edge Function.
--   • anon could call complete_pending_payment directly; p_amount_cents /
--     p_currency are optional (DEFAULT NULL) and the match check is skipped
--     entirely when omitted, so a caller who has ANY valid merchant_order_id
--     (e.g. their own, from a legitimately-initiated but never-paid
--     checkout) could mark it "paid" without ever completing payment on
--     Paymob.
--   • cancel_pending_payment, claim_coupon, release_coupon,
--     expire_stale_pending_payments were equally exposed (lower individual
--     severity, same root cause).
--
-- This is the exact class of bug the 2026-06-25 login-throttle hardening
-- already fixed correctly for get_user_id_by_email / login_throttle_status /
-- record_login_result (see 20260625_login_throttle_edge.sql) — those three
-- DO have the REVOKE and are not affected. This migration applies the same
-- fix to the functions that were missed.
--
-- New migration only — does not edit any existing migration file.
-- ══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.create_pending_payment(
  text, uuid, uuid, uuid, bigint, numeric, jsonb, text, jsonb, text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_pending_payment(text, text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_pending_payment(text, text, text, bigint, text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_payments()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_coupon(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.release_coupon(text)
  FROM PUBLIC, anon, authenticated;

-- The order-creation RPC used by both the COD path (create-storefront-order)
-- and by complete_pending_payment internally. SECURITY DEFINER functions
-- calling other SECURITY DEFINER functions execute as their own definer,
-- not as the original calling role, so complete_pending_payment's own call
-- into this function is unaffected by revoking anon/authenticated here.
REVOKE EXECUTE ON FUNCTION public.create_order_with_stock_deduction(
  uuid, text, text, numeric, jsonb, text, jsonb
) FROM PUBLIC, anon, authenticated;

-- Defense-in-depth: these are trigger functions (invoked via CREATE TRIGGER,
-- never meant to be called directly) and PostgREST normally excludes
-- `trigger`-return-type functions from /rpc/ exposure — but the direct grant
-- to anon/authenticated should not exist regardless of whether PostgREST
-- currently hides them.
REVOKE EXECUTE ON FUNCTION public.manage_stock_on_order_status_change()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.protect_profile_privileges()
  FROM PUBLIC, anon, authenticated;

-- Re-affirm the intended grants explicitly (idempotent; these already
-- existed, just re-stating for clarity now that PUBLIC no longer applies).
GRANT EXECUTE ON FUNCTION public.create_pending_payment(
  text, uuid, uuid, uuid, bigint, numeric, jsonb, text, jsonb, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pending_payment(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_pending_payment(text, text, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_payments() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_coupon(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_coupon(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock_deduction(
  uuid, text, text, numeric, jsonb, text, jsonb
) TO service_role;
