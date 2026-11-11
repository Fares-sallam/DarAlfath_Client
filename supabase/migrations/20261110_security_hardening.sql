-- Security hardening before the public trial (2026-11-10).
--
--  1. A durable rate limiter shared by every edge-function instance. The limits the
--     functions keep in memory reset whenever an instance restarts and are not shared
--     between instances, so a flood spread over a few instances walked straight past them.
--  2. Payments: a success that arrives after the pending row was closed (the buyer's first
--     card was declined and the second went through, or the 30 minutes ran out) now
--     creates the order instead of being refused, and a payment whose order cannot be
--     created (stock sold out meanwhile) is recorded as "paid, no order" and raised to the
--     admins instead of vanishing.
--  3. Customers can no longer insert rows into orders directly: every order goes through
--     the server-side functions, which price it and reserve its stock.
--  4. search_path pinned on two trigger functions (Supabase advisor).

-- ───────────────────────── 1. durable rate limiter ─────────────────────────

create table if not exists public.rate_limit_counters (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);

create index if not exists rate_limit_counters_window_idx
  on public.rate_limit_counters (window_start);

-- No policies on purpose: only the SECURITY DEFINER function below touches the table.
alter table public.rate_limit_counters enable row level security;
revoke all on table public.rate_limit_counters from anon, authenticated;

-- p_checks: [{ "bucket": "pay:ip:1.2.3.4:10m", "max": 20, "window": 600 }, ...]
-- Counts one hit in every bucket and returns the name of the first bucket that is now
-- over its limit, or NULL when the request may go on. Fixed windows: the counter of a
-- bucket restarts every `window` seconds.
create or replace function public.rate_limit_hits(p_checks jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check    jsonb;
  v_bucket   text;
  v_max      integer;
  v_window   integer;
  v_start    timestamptz;
  v_hits     integer;
  v_exceeded text := null;
begin
  if p_checks is null or jsonb_typeof(p_checks) <> 'array' then
    return null;
  end if;

  -- Always in the same order, so two requests sharing buckets can never deadlock.
  for v_check in
    select value from jsonb_array_elements(p_checks) order by value->>'bucket'
  loop
    v_bucket := left(coalesce(v_check->>'bucket', ''), 200);
    v_max    := coalesce((v_check->>'max')::integer, 0);
    v_window := greatest(coalesce((v_check->>'window')::integer, 60), 1);
    if v_bucket = '' or v_max <= 0 then
      continue;
    end if;

    v_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / v_window) * v_window);

    insert into rate_limit_counters as c (bucket, window_start, hits)
    values (v_bucket, v_start, 1)
    on conflict (bucket, window_start) do update set hits = c.hits + 1
    returning c.hits into v_hits;

    if v_hits > v_max and v_exceeded is null then
      v_exceeded := v_bucket;
    end if;
  end loop;

  return v_exceeded;
end;
$$;

revoke all on function public.rate_limit_hits(jsonb) from public, anon, authenticated;
grant execute on function public.rate_limit_hits(jsonb) to service_role;

-- Old windows are useless after they close; the longest window is one day.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'rate-limit-cleanup',
      '17 * * * *',
      $job$delete from public.rate_limit_counters where window_start < now() - interval '2 days'$job$
    );
  end if;
end;
$$;

-- ───────────────────────── 2. payments ─────────────────────────

-- When Paymob confirmed the money. Set together with the order on a normal completion;
-- set WITHOUT an order (status = 'failed') when the order could not be created.
alter table public.pending_payments add column if not exists paid_at timestamptz;

update public.pending_payments
   set paid_at = completed_at
 where status = 'completed' and paid_at is null;

create or replace function public.complete_pending_payment(
  p_merchant_order_id     text,
  p_paymob_order_id       text,
  p_paymob_transaction_id text,
  p_amount_cents          bigint default null,
  p_currency              text   default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pending    pending_payments%rowtype;
  v_rpc_result jsonb;
  v_order_id   text;
  v_coupon_id  uuid;
  v_discount   numeric := 0;
  v_shipping   numeric;
  v_subtotal   numeric := 0;
  v_total      numeric;
  v_coupon     record;
  v_reclaim    boolean := false;
  v_reason     text;
begin
  select * into v_pending from pending_payments
   where merchant_order_id = p_merchant_order_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'الطلب غير موجود');
  end if;

  if v_pending.status = 'completed' then
    return jsonb_build_object('success', true, 'already', true, 'order_id', v_pending.resulting_order_id);
  end if;

  -- The money arrived earlier and the order could not be created. It is not retried on
  -- its own: an admin either refunds it or serves the customer by hand.
  if v_pending.status = 'failed' and v_pending.paid_at is not null then
    return jsonb_build_object(
      'success', false, 'paid_unfulfilled', true, 'already', true,
      'error', coalesce(v_pending.failure_reason, 'مدفوع ولم يُنشأ الطلب'));
  end if;

  -- A confirmed payment wins over an earlier cancellation or expiry of the same row.
  if v_pending.status not in ('pending', 'cancelled', 'expired', 'failed') then
    return jsonb_build_object('success', false,
      'error', 'الطلب في حالة لا تسمح بالإتمام: ' || v_pending.status);
  end if;

  if p_amount_cents is not null and v_pending.amount_cents <> p_amount_cents then
    return jsonb_build_object('success', false, 'error', 'amount mismatch');
  end if;

  if p_currency is not null and upper(p_currency) <> 'EGP' then
    return jsonb_build_object('success', false, 'error', 'currency mismatch');
  end if;

  if v_pending.paymob_order_id is not null and v_pending.paymob_order_id <> ''
     and p_paymob_order_id is not null and p_paymob_order_id <> ''
     and v_pending.paymob_order_id <> p_paymob_order_id then
    return jsonb_build_object('success', false, 'error', 'paymob_order mismatch');
  end if;

  -- Closing the row released its coupon, so a late success has to take it again.
  v_reclaim := v_pending.status <> 'pending';

  select coalesce(sum(
    coalesce((it->>'price_per_item')::numeric, (it->>'price')::numeric, 0) * (it->>'quantity')::int
  ), 0) into v_subtotal
  from jsonb_array_elements(v_pending.items) it;

  v_shipping := v_pending.shipping_cost;

  if v_pending.coupon_code is not null and v_pending.coupon_code <> '' then
    -- The coupon was validated and its discount charged when the payment started, so it
    -- still applies if it was switched off since: the order must match what was paid.
    select * into v_coupon from coupons
     where code = upper(trim(v_pending.coupon_code))
     order by is_active desc, created_at desc
     limit 1;
    if found then
      v_coupon_id := v_coupon.id;
      if v_coupon.type = 'نسبة' then
        v_discount := round(v_subtotal * v_coupon.value / 100, 2);
      elsif v_coupon.type = 'مبلغ ثابت' then
        v_discount := least(v_coupon.value, v_subtotal);
      elsif v_coupon.type = 'شحن مجاني' then
        v_shipping := 0;
      end if;
    end if;
  end if;

  v_total := greatest(v_subtotal - v_discount + v_shipping, 0);

  -- Everything that can fail after the money was taken runs in its own block, so a
  -- failure undoes the half-made order and still leaves a record of the payment.
  begin
    if v_reclaim and v_coupon_id is not null then
      update coupons set used_count = coalesce(used_count, 0) + 1 where id = v_coupon_id;
    end if;

    -- country_id / payment_method_id passed as text (the callee casts to uuid itself)
    select create_order_with_stock_deduction(
      p_user_id           := v_pending.user_id,
      p_country_id        := v_pending.country_id::text,
      p_payment_method_id := v_pending.payment_method_id::text,
      p_shipping_cost     := v_shipping,
      p_shipping_address  := v_pending.shipping_address,
      p_notes             := v_pending.notes,
      p_items             := v_pending.items
    ) into v_rpc_result;

    v_order_id := v_rpc_result->>'id';
    if v_order_id is null then
      raise exception '%', coalesce(v_rpc_result->>'error', 'فشل إنشاء الطلب');
    end if;

    -- payment_status must be one of the allowed Arabic values (معلق/مدفوع/مرتجع/فاشل)
    update orders
       set coupon_id       = v_coupon_id,
           discount_amount = v_discount,
           total_price     = v_total,
           payment_status  = 'مدفوع'
     where id = v_order_id;
  exception
    -- Passing trouble: let the caller (Paymob's retry, the buyer's next poll) try again.
    when deadlock_detected or serialization_failure or lock_not_available then
      raise;
    when others then
      v_reason   := sqlerrm;
      v_order_id := null;
  end;

  if v_order_id is null then
    update pending_payments
       set status                = 'failed',
           paid_at               = coalesce(paid_at, now()),
           paymob_order_id       = coalesce(nullif(p_paymob_order_id, ''), paymob_order_id),
           paymob_transaction_id = coalesce(nullif(p_paymob_transaction_id, ''), paymob_transaction_id),
           failure_reason        = 'مدفوع ولم يُنشأ الطلب: ' || left(coalesce(v_reason, 'سبب غير معروف'), 400),
           completed_at          = now()
     where id = v_pending.id;

    -- The coupon goes back: this payment ends in a refund or a hand-made order.
    if not v_reclaim and v_pending.coupon_code is not null and v_pending.coupon_code <> '' then
      perform release_coupon(v_pending.coupon_code);
    end if;

    -- Tell the admins (user_id NULL = the dashboard bell of every admin). Never let the
    -- alert itself undo the record above.
    begin
      insert into notifications (user_id, title, body, type, data)
      values (
        null,
        'دفع بدون طلب',
        'تم خصم ' || trim(to_char(v_pending.amount_cents / 100.0, '999999990.00'))
          || ' ج.م ولم يُنشأ الطلب (' || left(coalesce(v_reason, 'سبب غير معروف'), 300)
          || '). راجع صفحة المدفوعات المعلقة: استرد المبلغ من Paymob أو تواصل مع العميل.',
        'error',
        jsonb_build_object(
          'kind', 'paid_unfulfilled',
          'merchant_order_id', v_pending.merchant_order_id,
          'pending_payment_id', v_pending.id)
      );
    exception when others then
      null;
    end;

    return jsonb_build_object('success', false, 'paid_unfulfilled', true,
      'error', coalesce(v_reason, 'فشل إنشاء الطلب'));
  end if;

  -- used_count is not incremented here for a normal completion: the coupon was claimed
  -- when the payment started (initiate-paymob-payment).
  update pending_payments
     set status                = 'completed',
         paid_at               = coalesce(paid_at, now()),
         paymob_order_id       = coalesce(nullif(p_paymob_order_id, ''), paymob_order_id),
         paymob_transaction_id = p_paymob_transaction_id,
         resulting_order_id    = v_order_id,
         failure_reason        = null,
         completed_at          = now()
   where id = v_pending.id;

  return jsonb_build_object('success', true, 'order_id', v_order_id, 'total', v_total);
end;
$function$;

-- ───────────────────────── 3. orders are created by the server only ─────────────────────────

-- Nothing in the storefront, the dashboard or the app inserts into orders; the policy let a
-- signed-in customer write an order row with any total and payment status.
drop policy if exists orders_own_insert on public.orders;

-- ───────────────────────── 4. advisor: pinned search_path ─────────────────────────

alter function public.set_home_hero_slides_updated_at() set search_path = public;
alter function public.set_intro_videos_updated_at() set search_path = public;
