-- Renew DARALFATH20: it expired 2026-07-20 and the storefront E2E suite
-- caught it (coupon apply test failing against live data). Extending by the
-- same ~3-month window as its original run, from today.
update public.coupons
set valid_to = now() + interval '3 months'
where upper(code) = 'DARALFATH20';
