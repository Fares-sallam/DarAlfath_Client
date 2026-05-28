// ════════════════════════════════════════════════════════════════════════
//  check-paymob-transaction
//  ──────────────────────────────────────────────────────────────────────
//  Polled by the frontend every few seconds after the customer initiates a
//  Paymob payment. We query Paymob's authoritative transaction API and:
//
//    • If transaction is successful AND not yet completed →
//        call `complete_pending_payment` RPC which inserts the real order
//        and order_items rows.
//
//    • If transaction is failed → call `cancel_pending_payment` to release
//        the reserved stock.
//
//    • Otherwise → return `pending` so the client keeps polling.
//
//  Source of truth = Paymob server. We never trust client-supplied params.
// ════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PAYMOB_API_KEY = Deno.env.get('PAYMOB_API_KEY') ?? '';
const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ status: 'error', error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface PaymobTxn {
  id?:           number;
  success?:      boolean;
  pending?:      boolean;
  is_voided?:    boolean;
  is_refunded?:  boolean;
  error_occured?: boolean;
  data?:         { message?: string };
  order?:        { id?: number; merchant_order_id?: string };
  amount_cents?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  try {
    if (!PAYMOB_API_KEY) {
      return jsonOk({ status: 'error', error: 'PAYMOB_API_KEY غير مضبوط' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { merchantOrderId, cancel } = (await req.json()) as {
      merchantOrderId: string;
      cancel?: boolean;
    };

    if (!merchantOrderId) {
      return jsonOk({ status: 'error', error: 'merchantOrderId مطلوب' });
    }

    // ── Idempotency: if already completed, just return order id ────────
    const { data: existing } = await supabase
      .from('pending_payments')
      .select('status, resulting_order_id, paymob_order_id, failure_reason, coupon_code')
      .eq('merchant_order_id', merchantOrderId)
      .maybeSingle();

    if (!existing) {
      return jsonOk({ status: 'not_found', error: 'لم نجد طلباً معلقاً بهذا الرقم' });
    }

    if (existing.status === 'completed') {
      return jsonOk({
        status:  'success',
        orderId: existing.resulting_order_id,
        already: true,
      });
    }

    if (existing.status === 'failed' || existing.status === 'cancelled' || existing.status === 'expired') {
      return jsonOk({
        status: 'failed',
        error:  existing.failure_reason ?? 'الدفع فشل',
      });
    }

    // ── Get Paymob auth token ──────────────────────────────────────────
    const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ api_key: PAYMOB_API_KEY }),
    });

    if (!authRes.ok) {
      const t = await authRes.text();
      console.error('[check-paymob] Paymob auth failed:', t);
      return jsonOk({ status: 'pending', error: 'تعذر الاتصال بـ Paymob' });
    }

    const { token: authToken } = await authRes.json();

    // ── Query Paymob's transaction inquiry API ─────────────────────────
    //  POST /api/ecommerce/orders/transaction_inquiry
    //    { auth_token, order_id }  ← Paymob's order id (NOT our merchant_order_id)
    //  Or:
    //  POST same endpoint
    //    { auth_token, merchant_order_id } ← our id
    //
    //  We use merchant_order_id since that's what we always have.
    const inquiryRes = await fetch(
      'https://accept.paymob.com/api/ecommerce/orders/transaction_inquiry',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token:        authToken,
          merchant_order_id: merchantOrderId,
        }),
      },
    );

    if (!inquiryRes.ok) {
      const t = await inquiryRes.text();
      console.warn('[check-paymob] inquiry failed:', inquiryRes.status, t.substring(0, 200));
      // Don't treat as failure yet — let client keep polling
      return jsonOk({ status: 'pending' });
    }

    const inquiry = (await inquiryRes.json()) as PaymobTxn | PaymobTxn[];
    const txn: PaymobTxn = Array.isArray(inquiry) ? inquiry[0] : inquiry;

    console.log('[check-paymob] inquiry result:', JSON.stringify({
      success:       txn?.success,
      pending:       txn?.pending,
      error_occured: txn?.error_occured,
      message:       txn?.data?.message,
      id:            txn?.id,
    }));

    // Helper: release coupon if it was claimed with this pending payment
    async function releaseCouponIfNeeded() {
      if (existing.coupon_code) {
        try {
          await supabase.rpc('release_coupon', { p_coupon_code: existing.coupon_code });
          console.log(`[check-paymob] Coupon ${existing.coupon_code} released`);
        } catch (e) {
          console.warn('[check-paymob] release_coupon failed:', e);
        }
      }
    }

    // No transaction yet → customer hasn't completed payment
    if (!txn || txn.id == null) {
      // cancel=true + no transaction → safe to cancel (nothing was charged)
      if (cancel) {
        await supabase.rpc('cancel_pending_payment', {
          p_merchant_order_id: merchantOrderId,
          p_reason: 'ألغاه العميل (لا توجد معاملة)',
        });
        await releaseCouponIfNeeded();
        return jsonOk({ status: 'failed', error: 'تم إلغاء الدفع.', cancelled: true });
      }
      return jsonOk({ status: 'pending' });
    }

    const isSuccess = txn.success === true && txn.pending !== true && txn.error_occured !== true;
    const isFailed  = txn.success === false || txn.error_occured === true;

    if (isSuccess) {
      // Convert pending_payment → real order
      const { data: result, error: completeErr } = await supabase.rpc(
        'complete_pending_payment',
        {
          p_merchant_order_id:     merchantOrderId,
          p_paymob_order_id:       String(txn.order?.id ?? existing.paymob_order_id ?? ''),
          p_paymob_transaction_id: String(txn.id),
        },
      );

      if (completeErr) {
        console.error('[check-paymob] complete error:', completeErr);
        return jsonOk({ status: 'pending', error: completeErr.message });
      }

      if (!result?.success) {
        return jsonOk({ status: 'pending', error: result?.error ?? 'تعذر إتمام الطلب' });
      }

      // Fire-and-forget email notification (non-blocking; failures are logged)
      try {
        await supabase.functions.invoke('send-order-email', {
          body: { orderId: result.order_id },
          headers: INTERNAL_FUNCTION_SECRET
            ? { 'x-internal-function-secret': INTERNAL_FUNCTION_SECRET }
            : undefined,
        });
      } catch (e) {
        console.warn('[check-paymob] email dispatch failed:', e);
      }

      return jsonOk({
        status:  'success',
        orderId: result.order_id,
        total:   result.total,
      });
    }

    if (isFailed) {
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason:            txn.data?.message ?? 'فشل الدفع',
      });
      await releaseCouponIfNeeded();
      return jsonOk({
        status: 'failed',
        error:  txn.data?.message ?? 'فشل الدفع',
      });
    }

    // Still pending on Paymob side (e.g. Fawry — customer may pay later)
    if (cancel) {
      // DON'T cancel the pending_payment — a webhook may still complete it.
      // Just tell the client to stop polling. The reservation will be resolved
      // by the Paymob webhook (success → complete, fail → cancel) or by the
      // pending_payments expiry mechanism.
      console.log(`[check-paymob] cancel requested but txn is pending — NOT cancelling stock reservation for ${merchantOrderId}`);
      return jsonOk({ status: 'failed', error: 'تم إلغاء المتابعة. لو دفعت بالفعل سيتم تأكيد طلبك تلقائياً.', cancelled: true });
    }
    return jsonOk({ status: 'pending' });
  } catch (err) {
    console.error('[check-paymob] Unexpected:', err);
    return jsonOk({
      status: 'pending',
      error:  err instanceof Error ? err.message : 'خطأ غير متوقع',
    });
  }
});
