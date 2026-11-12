-- Free-shipping offers (2026-11-12): instead of one store-wide threshold
-- (store_settings.free_shipping_threshold), a list of offers, each with a minimum order, a channel
-- (the website, the app, or both), optional dates, and an on/off switch. When several are live for a
-- channel the lowest minimum wins. Egypt only, as before (the callers check the country).
-- The order and payment functions read current_free_shipping(channel) server side; the store and
-- the app read it for the cart's progress bar.

create table if not exists public.shipping_offers (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null default 'شحن مجاني',
  min_subtotal numeric(10,2) not null check (min_subtotal >= 0),
  channel      text        not null default 'all' check (channel in ('all', 'web', 'app')),
  starts_at    timestamptz,
  ends_at      timestamptz,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

alter table public.shipping_offers enable row level security;

-- Anyone may see the offers that are live now (they are advertised in the cart anyway).
drop policy if exists shipping_offers_public_read on public.shipping_offers;
create policy shipping_offers_public_read on public.shipping_offers
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

-- Admins see and manage all of them.
drop policy if exists shipping_offers_admin_all on public.shipping_offers;
create policy shipping_offers_admin_all on public.shipping_offers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.set_shipping_offers_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shipping_offers_updated_at on public.shipping_offers;
create trigger shipping_offers_updated_at before update on public.shipping_offers
  for each row execute function public.set_shipping_offers_updated_at();

-- The offer that applies to a channel right now ('web' or 'app'): the live one with the lowest
-- minimum, or no row when none is live.
create or replace function public.current_free_shipping(p_channel text)
returns table (offer_id uuid, title text, min_subtotal numeric, ends_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select o.id, o.title, o.min_subtotal, o.ends_at
    from shipping_offers o
   where o.is_active
     and o.channel in ('all', p_channel)
     and (o.starts_at is null or o.starts_at <= now())
     and (o.ends_at is null or o.ends_at > now())
   order by o.min_subtotal asc, o.ends_at asc nulls last
   limit 1;
$$;

grant execute on function public.current_free_shipping(text) to anon, authenticated, service_role;
grant select on public.shipping_offers to anon, authenticated;
grant insert, update, delete on public.shipping_offers to authenticated;

-- The current store-wide threshold becomes the first offer (both channels), so nothing changes
-- for customers when this lands.
insert into public.shipping_offers (title, min_subtotal, channel)
select 'شحن مجاني', s.free_shipping_threshold, 'all'
  from (select free_shipping_threshold from public.store_settings order by updated_at desc limit 1) s
 where coalesce(s.free_shipping_threshold, 0) > 0
   and not exists (select 1 from public.shipping_offers);
