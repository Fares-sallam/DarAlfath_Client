-- ══════════════════════════════════════════════════════════════════════════
-- Second wave of the same fix as 20260731_lock_down_internal_rpc_execute_grants.sql
-- (same root cause: PUBLIC's default EXECUTE grant was never revoked). Found
-- via `supabase db advisors` after the first fix, cross-checked live.
--
-- 1) apply_coupon_to_order(text, text) — CONFIRMED dead code (not called from
--    any current frontend path — src/pages/CheckoutPage.tsx only has a
--    comment noting it's no longer needed) AND has no ownership check at all:
--    it looks up any order by id::text and mutates its coupon/discount/total
--    directly. Order ids are short (6 hex chars after the date prefix, e.g.
--    ORD-20260731-6d9cca) — guessable by brute force with no rate limiting
--    on the raw RPC path. Anyone could apply an arbitrary coupon to any
--    order that doesn't already have one, corrupting totals (real cash-loss
--    risk on COD orders specifically, since courier collection amount would
--    no longer match the true total).
--
-- 2) Trigger functions (return type `trigger`, no params) — not practically
--    reachable via PostgREST (which excludes trigger-return-type functions
--    from /rpc/), but had the same missing REVOKE. Defense-in-depth only.
--
-- 3) check_admin_email_exists(text) — despite the name, actually checks
--    "does an active profile+auth.users row exist for this email" (no role
--    check at all), so it's a general account-existence oracle. Revoking
--    from anon only (unauthenticated visitors have no legitimate reason to
--    probe this); leaving `authenticated` intact since it may be used by
--    the separate admin dashboard app (not in this repo) with a real
--    session — verify there before revoking that too.
-- ══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.apply_coupon_to_order(text, text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_inventory()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_inventory_for_variant()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_log_trigger()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_price_to_egypt()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.check_admin_email_exists(text)
  FROM PUBLIC, anon;

-- ── inventory_dashboard_view: SECURITY DEFINER staff-dashboard view (exact
--    stock, reserved_stock, min_stock reorder thresholds) was readable by
--    anon (any site visitor, no login) — clear ERROR-level finding from
--    `supabase db advisors`. Revoking anon only here, conservatively:
--    `authenticated` is left intact because this project's admin dashboard
--    is a separate codebase not present in this session, and blindly
--    revoking authenticated risks breaking a legitimate staff feature I
--    can't verify from here. This still leaves the view readable by any
--    logged-in *customer* (not just staff) — flagged in the report as
--    needing a follow-up (either gate the view itself on is_admin(), or
--    move the dashboard's read to a proper is_admin()-checked path).
--    The INSERT/UPDATE/DELETE/TRUNCATE grants below are inert in practice
--    (multi-table join view, no INSTEAD OF triggers, not auto-updatable)
--    but are revoked anyway for cleanliness.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inventory_dashboard_view
  FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.inventory_dashboard_view FROM anon;
