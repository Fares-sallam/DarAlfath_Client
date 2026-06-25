-- ══════════════════════════════════════════════════════════════════════════
-- تحصينات أمنية: التحميل الرقمي (audit) + Paymob (client_secret + تحقق المبلغ)
-- + الكوبونات (منع double-increment + تحرير عند الانتهاء)
-- migration جديدة فقط — لا تُعدّل القديمة.
-- ══════════════════════════════════════════════════════════════════════════

-- ── دالة is_admin() self-contained ────────────────────────────────────────
-- تُعرّف هنا حتى تعمل الـ migration على القاعدة الحيّة وعلى إعادة بناء نظيفة. تطابق
-- نموذج الأدمن الفعلي على live: المالك مُعرَّف بالإيميل (نفس سياسات orders/products)،
-- والموظفون عبر profiles.role أو وجود صف في admin_settings. لا تعتمد على get_my_role.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE((auth.jwt() ->> 'email') = 'faresalsaid780@gmail.com', false)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = ANY (ARRAY['super_admin', 'admin', 'manager'])
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_settings
      WHERE user_id = auth.uid()
    );
$$;

-- ── P1: جدول تدقيق محاولات التحميل الرقمي ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.download_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  order_item_id uuid,
  product_id    uuid,
  success       boolean NOT NULL DEFAULT false,
  reason        text,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.download_audit ENABLE ROW LEVEL SECURITY;
-- يكتبه service_role فقط (الدالة)؛ يقرأه الأدمن
DROP POLICY IF EXISTS "download_audit_admin_read" ON public.download_audit;
CREATE POLICY "download_audit_admin_read" ON public.download_audit
  FOR SELECT TO authenticated
  USING (public.is_admin());
DROP POLICY IF EXISTS "download_audit_service_write" ON public.download_audit;
CREATE POLICY "download_audit_service_write" ON public.download_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── P1b: ملفات الكتب الرقمية لا تُقرأ مباشرة من الويب/العميل ─────────────
-- نسقط كل سياسات القراءة المفتوحة (true) لمنع كشف file_path. كانت هناك سياستان
-- بنفس الخطورة: public_read_electronic_books (anon) و ebooks_auth_select (authenticated).
DROP POLICY IF EXISTS "public_read_electronic_books" ON public.electronic_books;
DROP POLICY IF EXISTS "ebooks_auth_select"           ON public.electronic_books;
DROP POLICY IF EXISTS "admin_full_electronic_books" ON public.electronic_books;
CREATE POLICY "admin_full_electronic_books" ON public.electronic_books
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── P2: سرّ عميل لكل pending_payment (نخزّن hash فقط) ──────────────────────
-- التحقق من السرّ يتم داخل Edge Function (check-paymob-transaction): يقرأ الـ hash
-- ويقارنه بـ SHA-256(clientSecret) — فلا حاجة لدالة DB أو pgcrypto.
ALTER TABLE public.pending_payments
  ADD COLUMN IF NOT EXISTS client_secret_hash text;

-- ── P2+P4: إعادة تعريف complete_pending_payment ──────────────────────────
--   • تحقق amount_cents / currency / paymob_order_id مقابل pending_payments
--   • منع double-increment للكوبون (تم claim عند initiate بالفعل)
-- نحذف نسخة الـ 3-args القديمة؛ النسخة الجديدة بالـ defaults تقبل 3 أو 5 args.
DROP FUNCTION IF EXISTS public.complete_pending_payment(text, text, text);
CREATE OR REPLACE FUNCTION public.complete_pending_payment(
  p_merchant_order_id     text,
  p_paymob_order_id       text,
  p_paymob_transaction_id text,
  p_amount_cents          bigint DEFAULT NULL,
  p_currency              text   DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pending    pending_payments%ROWTYPE;
  v_rpc_result jsonb;
  v_order_id   text;
  v_coupon_id  uuid;
  v_discount   numeric := 0;
  v_shipping   numeric;
  v_subtotal   numeric := 0;
  v_total      numeric;
  v_coupon     RECORD;
BEGIN
  SELECT * INTO v_pending FROM pending_payments
   WHERE merchant_order_id = p_merchant_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود');
  END IF;

  IF v_pending.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already', true, 'order_id', v_pending.resulting_order_id);
  END IF;

  IF v_pending.status NOT IN ('pending') THEN
    RETURN jsonb_build_object('success', false,
      'error', 'الطلب في حالة لا تسمح بالإتمام: ' || v_pending.status);
  END IF;

  -- ── تحقق سلامة الدفع مقابل القيم المخزّنة (لا نثق بالـ webhook وحده) ──
  IF p_amount_cents IS NOT NULL AND v_pending.amount_cents <> p_amount_cents THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount mismatch');
  END IF;
  IF p_currency IS NOT NULL AND upper(p_currency) <> 'EGP' THEN
    RETURN jsonb_build_object('success', false, 'error', 'currency mismatch');
  END IF;
  IF v_pending.paymob_order_id IS NOT NULL AND v_pending.paymob_order_id <> ''
     AND p_paymob_order_id IS NOT NULL AND p_paymob_order_id <> ''
     AND v_pending.paymob_order_id <> p_paymob_order_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'paymob_order mismatch');
  END IF;

  -- subtotal من العناصر المجمّدة
  SELECT COALESCE(SUM(
    COALESCE((it->>'price_per_item')::numeric, (it->>'price')::numeric, 0) * (it->>'quantity')::int
  ), 0) INTO v_subtotal FROM jsonb_array_elements(v_pending.items) it;

  v_shipping := v_pending.shipping_cost;

  IF v_pending.coupon_code IS NOT NULL AND v_pending.coupon_code <> '' THEN
    SELECT * INTO v_coupon FROM coupons
     WHERE code = UPPER(TRIM(v_pending.coupon_code)) AND is_active = true;
    IF FOUND THEN
      v_coupon_id := v_coupon.id;
      IF v_coupon.type = 'نسبة' THEN
        v_discount := ROUND(v_subtotal * v_coupon.value / 100, 2);
      ELSIF v_coupon.type = 'مبلغ ثابت' THEN
        v_discount := LEAST(v_coupon.value, v_subtotal);
      ELSIF v_coupon.type = 'شحن مجاني' THEN
        v_shipping := 0;
      END IF;
    END IF;
  END IF;

  v_total := GREATEST(v_subtotal - v_discount + v_shipping, 0);

  SELECT create_order_with_stock_deduction(
    p_user_id           := v_pending.user_id,
    p_country_id        := v_pending.country_id,
    p_payment_method_id := v_pending.payment_method_id,
    p_shipping_cost     := v_shipping,
    p_shipping_address  := v_pending.shipping_address,
    p_notes             := v_pending.notes,
    p_items             := v_pending.items
  ) INTO v_rpc_result;

  v_order_id := v_rpc_result->>'id';
  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', COALESCE(v_rpc_result->>'error', 'فشل إنشاء الطلب'));
  END IF;

  UPDATE orders
     SET coupon_id = v_coupon_id, discount_amount = v_discount,
         total_price = v_total, payment_status = 'paid'
   WHERE id = v_order_id;

  -- ⚠️ P4: لا نزيد used_count هنا — تم claim الكوبون عند initiate-paymob-payment.

  UPDATE pending_payments
     SET status = 'completed', paymob_order_id = p_paymob_order_id,
         paymob_transaction_id = p_paymob_transaction_id,
         resulting_order_id = v_order_id, completed_at = NOW()
   WHERE id = v_pending.id;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'total', v_total);
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_pending_payment(text, text, text, bigint, text) TO service_role;

-- ── P4: expire يحرّر أي كوبون محجوز قبل التعليم بالانتهاء ──────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_pending_payments()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_coupon_code text;
BEGIN
  -- حدّث الصفوف أولاً بـ UPDATE ... RETURNING حتى لا نحرّر كوبوناً لدفعة
  -- التقطتها عملية أخرى وأتمتها في نفس اللحظة.
  FOR v_coupon_code IN
    UPDATE pending_payments
       SET status = 'expired', failure_reason = 'انتهت مدة الصلاحية', completed_at = NOW()
     WHERE status = 'pending' AND expires_at < NOW()
     RETURNING coupon_code
  LOOP
    v_count := v_count + 1;
    IF v_coupon_code IS NOT NULL AND v_coupon_code <> '' THEN
      PERFORM public.release_coupon(v_coupon_code);
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_payments() TO service_role;
