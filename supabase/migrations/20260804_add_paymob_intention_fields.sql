-- ══════════════════════════════════════════════════════════════════════════
-- Paymob migration: classic Accept API (api_key → auth token → ecommerce
-- order → payment_key → iframe) → Intention API (secret key → intention →
-- unified checkout). Verified live 2026-08-04: the merchant account now
-- rejects the classic /api/auth/tokens endpoint with "incorrect credentials"
-- for BOTH the old and the new api_key, while the new secret key is accepted
-- by /v1/intention — i.e. the account has been migrated server-side and the
-- classic path is dead, not merely misconfigured.
--
-- Consequence for status polling: /api/ecommerce/orders/transaction_inquiry
-- requires a classic auth token we can no longer obtain, so
-- check-paymob-transaction can't use it. It now reads the intention's status
-- from GET /v1/intention/element/{public_key}/{client_secret}/ instead, which
-- needs Paymob's per-intention client_secret persisted alongside the pending
-- payment.
--
-- NOTE this is Paymob's client_secret — completely distinct from the existing
-- `client_secret_hash` column, which stores OUR OWN per-payment buyer token
-- (see 20260612_security_hardening_downloads_paymob_coupons.sql). Different
-- purpose, different value; do not conflate them.
--
-- No change is needed to complete_pending_payment's integrity checks: the
-- intention's `intention_order_id` is stored in the existing paymob_order_id
-- column and matches `obj.order.id` in the webhook payload, and amount_cents
-- is unchanged, so the amount/order/currency verification keeps working
-- exactly as before.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pending_payments
  ADD COLUMN IF NOT EXISTS paymob_client_secret text;

COMMENT ON COLUMN public.pending_payments.paymob_client_secret IS
  'Paymob Intention API per-intention client_secret, used to poll intention status. NOT the buyer-facing client secret (see client_secret_hash).';
