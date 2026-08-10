-- Void the six 2026-08-06 orders that came from the Paymob TEST-mode session.
--
-- They are not a code defect: Paymob genuinely returns success=true for a
-- test-mode transaction, so the storefront correctly recorded them as paid.
-- The fault was configuration — test integration keys pointed at the
-- production database — so no money ever moved for these six.
--
-- Identified by the exact test window (03:15–07:15 UTC on 2026-08-06) plus
-- owner/test emails. The real-card attempts later the same evening already
-- recorded correctly as cancelled and are untouched, as is the genuine
-- 2026-08-09 payment.
--
-- Cancelled rather than deleted: the Paymob transaction ids stay auditable,
-- and 'ملغي' + 'فاشل' keep them out of revenue and fulfilment.
begin;

update public.orders
set status         = 'ملغي',
    payment_status = 'فاشل',
    inventory_reserved = false,
    notes = coalesce(notes || E'\n', '') ||
            '[تصحيح آلي 2026-08-09] طلب اختباري من جلسة Paymob test mode — لم تُدفع أموال حقيقية.',
    updated_at = now()
where id in (
  'ORD-20260806-c75792',
  'ORD-20260806-de8404',
  'ORD-20260806-dcd736',
  'ORD-20260806-8469a0',
  'ORD-20260806-6c88d0',
  'ORD-20260806-5ae19c'
);

-- Reconcile reserved_stock to what is *actually* still reserved rather than
-- decrementing by the voided quantities. The order rows claim 11 reserved
-- units in total but product_inventory holds only 1 (stock was re-set from
-- the dashboard at some point after the test session), so a blind decrement
-- would drive reserved_stock to -9.
update public.product_inventory pi
set reserved_stock = coalesce((
      select sum(oi.quantity)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where oi.variant_id = pi.variant_id
        and o.inventory_reserved is true
        and o.stock_deducted is not true
        and o.status not in ('ملغي', 'مرتجع')
    ), 0),
    updated_at = now()
where pi.variant_id in (
  select distinct oi.variant_id
  from public.order_items oi
  where oi.order_id in (
    'ORD-20260806-c75792','ORD-20260806-de8404','ORD-20260806-dcd736',
    'ORD-20260806-8469a0','ORD-20260806-6c88d0','ORD-20260806-5ae19c'
  )
);

commit;
