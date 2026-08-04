-- ══════════════════════════════════════════════════════════════════════════
-- Hardening (lower urgency than the two migrations above): pin search_path
-- on functions the Supabase advisor flagged as "search_path mutable". A
-- mutable search_path on a SECURITY DEFINER function is a known privilege-
-- escalation vector if an attacker can create objects earlier in the search
-- path — not practically exploitable here today since anon/authenticated
-- have no schema-creation rights on this project, but it's a one-line,
-- zero-risk fix (ALTER FUNCTION, not a redefinition) so there's no reason
-- to leave it open.
-- ══════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.auto_create_inventory() SET search_path = public;
ALTER FUNCTION public.auto_create_inventory_for_variant() SET search_path = public;
ALTER FUNCTION public.sync_product_price_to_egypt() SET search_path = public;
ALTER FUNCTION public.fn_create_audit_trigger(text) SET search_path = public;
ALTER FUNCTION public.is_active_admin() SET search_path = public;
