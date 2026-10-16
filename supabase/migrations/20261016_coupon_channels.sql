-- Coupons per sales channel (2026-10-16).
--
-- A coupon is for the website, for the mobile app (iPhone and Android alike), or for both. What the
-- dashboard saves in `coupons.channel` is enforced by the edge functions that redeem a coupon
-- (validate-coupon, create-storefront-order, initiate-paymob-payment): they tell the app from the
-- website by its x-app-key, so the rule can't be skipped by a client that doesn't check it.
--
--   'all'  both the website and the app (what every existing coupon keeps being)
--   'web'  the website only
--   'app'  the app only
--
-- Nothing else changes: the public read of active coupons and the admin-only writes stay as they are.

alter table public.coupons
  add column if not exists channel text not null default 'all';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'coupons_channel_check' and conrelid = 'public.coupons'::regclass
  ) then
    alter table public.coupons
      add constraint coupons_channel_check check (channel in ('all', 'web', 'app'));
  end if;
end $$;

comment on column public.coupons.channel is
  'Where the coupon works: all (website and app), web (website only) or app (mobile app only). Enforced in the order and coupon edge functions.';
