-- ══════════════════════════════════════════════════════════════════════════
-- FIX: reserved_stock لا يُنقص عند "تم التوصيل"
--
-- المشكلة: الـ trigger يخصم `stock` عند التوصيل لكن يترك `reserved_stock`
--          كما هو، مما يجعل available_stock أقل من الحقيقي.
--
-- التأثير: هذا الـ SQL يُعدّل:
--   1. الـ trigger فقط (manage_stock_on_order_status_change)
--      - فرع الإلغاء:  لا تغيير في المنطق، فقط تنظيف
--      - فرع التوصيل:  إضافة خصم reserved_stock بجانب stock
--   2. إصلاح البيانات الموجودة: تصحيح reserved_stock
--      للـ variants التي تحتوي على طلبات موصَّلة قديمة
--
-- لا يتأثر:
--   - create_order_with_stock_deduction   (لم يُمس)
--   - create_order_pending_payment        (لم يُمس)
--   - confirm_online_payment              (لم يُمس)
--   - cancel_pending_payment_order        (لم يُمس)
--   - finalize_order_inventory            (لم يُمس — صح من الأساس)
--   - reserve_order_inventory             (لم يُمس)
--   - release_order_inventory             (لم يُمس)
--   - جدول orders                         (لم يُمس)
--   - جدول order_items                    (لم يُمس)
--   - جدول product_inventory.stock        (لم يُمس — الرقم الحقيقي صح)
-- ══════════════════════════════════════════════════════════════════════════


-- ── 1. إصلاح الـ trigger ───────────────────────────────────────────────────
-- الفرق الوحيد عن النسخة القديمة:
--   فرع "تم التوصيل" أصبح يخصم reserved_stock أيضاً (كان ينساه)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_stock_on_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN

  -- ── إلغاء أو استرداد → تحرير الحجز فقط إن كان الطلب محجوزاً ───────────
  IF NEW.status IN ('ملغي', 'مرتجع')
     AND OLD.status NOT IN ('ملغي', 'مرتجع')
     AND COALESCE(OLD.inventory_reserved, FALSE) = TRUE
  THEN
    UPDATE public.product_inventory pi
    SET    reserved_stock = GREATEST(0, COALESCE(pi.reserved_stock, 0) - oi.quantity),
           updated_at     = NOW()
    FROM   public.order_items oi
    WHERE  oi.order_id   = NEW.id
      AND  oi.variant_id = pi.variant_id
      AND  oi.product_id = pi.product_id
      AND  oi.is_digital = FALSE
      AND  (NEW.country_id IS NULL OR pi.country_id = NEW.country_id);

    UPDATE public.orders
    SET    inventory_reserved = FALSE
    WHERE  id = NEW.id;
  END IF;

  -- ── تم التوصيل → خصم نهائي من stock + تحرير reserved_stock ─────────────
  -- الإضافة: reserved_stock = pi.reserved_stock - qty  ← هذا هو الإصلاح
  IF NEW.status = 'تم التوصيل'
     AND OLD.status NOT IN ('تم التوصيل', 'ملغي', 'مرتجع')
     AND COALESCE(OLD.inventory_reserved, FALSE) = TRUE
  THEN
    UPDATE public.product_inventory pi
    SET    stock          = GREATEST(0, COALESCE(pi.stock, 0) - oi.quantity),
           reserved_stock = GREATEST(0, COALESCE(pi.reserved_stock, 0) - oi.quantity),
           updated_at     = NOW()
    FROM   public.order_items oi
    WHERE  oi.order_id   = NEW.id
      AND  oi.variant_id = pi.variant_id
      AND  oi.product_id = pi.product_id
      AND  oi.is_digital = FALSE
      AND  (NEW.country_id IS NULL OR pi.country_id = NEW.country_id);

    UPDATE public.orders
    SET    inventory_reserved  = FALSE,
           inventory_finalized = TRUE
    WHERE  id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


-- ── 2. إصلاح البيانات الموجودة ─────────────────────────────────────────────
-- يُصحّح reserved_stock لكل variant بناءاً على الطلبات المحجوزة فعلاً
-- (الطلبات التي inventory_reserved = TRUE)
-- لا يتغير stock — فقط reserved_stock يُصحَّح
-- ──────────────────────────────────────────────────────────────────────────
WITH correct_reserved AS (
  SELECT
    pi.id                          AS inventory_id,
    pi.reserved_stock              AS current_reserved,
    COALESCE(SUM(oi.quantity), 0)  AS correct_reserved
  FROM public.product_inventory pi
  LEFT JOIN public.order_items oi
    ON  oi.variant_id = pi.variant_id
    AND oi.product_id = pi.product_id
    AND oi.is_digital = FALSE
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE  o.id                 = oi.order_id
        AND  o.inventory_reserved = TRUE
        AND  (o.country_id = pi.country_id OR pi.country_id IS NULL)
    )
  GROUP BY pi.id, pi.reserved_stock
)
UPDATE public.product_inventory pi
SET    reserved_stock = cr.correct_reserved,
       updated_at     = NOW()
FROM   correct_reserved cr
WHERE  pi.id              = cr.inventory_id
  AND  cr.current_reserved <> cr.correct_reserved;

-- عرض ما تغيّر (للتأكيد فقط)
-- SELECT variant_id, stock, reserved_stock FROM product_inventory
-- WHERE updated_at > NOW() - INTERVAL '5 seconds';
