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

const PAYMOB_SECRET_KEY = Deno.env.get('PAYMOB_SECRET_KEY') ?? '';
const PAYMOB_PUBLIC_KEY = Deno.env.get('PAYMOB_PUBLIC_KEY') ?? '';
const PAYMOB_BASE_URL = 'https://accept.paymob.com';
const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';

// ── In-memory rate limit (per IP per isolate) ──
const RL_WINDOW_MS = 5 * 60 * 1000;
const RL_MAX = 120; // polling-friendly
const rlBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(req: Request): boolean {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const b = rlBuckets.get(ip);
  if (rlBuckets.size > 2000) for (const [k, v] of rlBuckets) if (v.resetAt <= now) rlBuckets.delete(k);
  if (!b || b.resetAt <= now) { rlBuckets.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS }); return false; }
  b.count += 1; return b.count > RL_MAX;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

// Verified live 2026-08-04: the Intention API's /v1/intention/element/ endpoint
// does NOT return a `transactions` array (that assumption was carried over
// from the classic Order Inquiry response shape and never actually matched
// this endpoint — meaning this function could never detect a successful
// payment before this fix). The authoritative outcome is the top-level
// `paid` boolean; the per-transaction fields (id, amount_cents, decline
// message, ...) only show up as query params on `redirection_url`, and only
// once a transaction has actually been attempted (an untouched intention has
// no `redirection_url` at all — confirmed live).
function txnFromRedirectionUrl(url: string | null | undefined): PaymobTxn | null {
  if (!url) return null;
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return null;
  }
  if (!params.has('id')) return null;
  return {
    id:             Number(params.get('id')),
    success:        params.get('success') === 'true',
    pending:        params.get('pending') === 'true',
    is_voided:      params.get('is_voided') === 'true',
    is_refunded:    params.get('is_refunded') === 'true',
    error_occured:  params.get('error_occured') === 'true',
    data:           { message: params.get('data.message') ?? undefined },
    order: {
      id:                params.has('order') ? Number(params.get('order')) : undefined,
      merchant_order_id: params.get('merchant_order_id') ?? undefined,
    },
    amount_cents:   params.has('amount_cents') ? Number(params.get('amount_cents')) : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }
  if (rateLimited(req)) {
    return jsonError('محاولات كثيرة. حاول بعد قليل.', 429);
  }

  try {
    if (!PAYMOB_SECRET_KEY || !PAYMOB_PUBLIC_KEY) {
      return jsonOk({ status: 'error', error: 'مفاتيح Paymob غير مضبوطة' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { merchantOrderId, cancel, clientSecret } = (await req.json()) as {
      merchantOrderId: string;
      cancel?: boolean;
      clientSecret?: string;
    };

    if (!merchantOrderId) {
      return jsonOk({ status: 'error', error: 'merchantOrderId مطلوب' });
    }

    // ── Idempotency: if already completed, just return order id ────────
    const { data: existing } = await supabase
      .from('pending_payments')
      .select('status, resulting_order_id, paymob_order_id, failure_reason, coupon_code, client_secret_hash, paymob_client_secret')
      .eq('merchant_order_id', merchantOrderId)
      .maybeSingle();

    if (!existing) {
      return jsonOk({ status: 'not_found', error: 'لم نجد طلباً معلقاً بهذا الرقم' });
    }

    // ── Idempotent terminal states: return status WITHOUT requiring the secret.
    //    قراءة طلب مكتمل/فاشل عبر رقمه (UUID غير قابل للتخمين) غير ضارّة، وتمنع
    //    ظهور 403 خاطئ في صفحة العودة من Paymob لو كان تبويب المتابعة قد أكمل
    //    الدفع ومسح السرّ المخزّن بالفعل.
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

    // ── Ownership: الطلب ما زال pending — نطلب الـ clientSecret الصادر عند initiate
    //    قبل الاستعلام من Paymob أو الإلغاء. merchant_order_id وحده لا يكفي للتصرّف
    //    في دفعة حيّة.
    if (existing.client_secret_hash) {
      const provided = (clientSecret ?? '').trim();
      if (!provided || (await sha256Hex(provided)) !== existing.client_secret_hash) {
        return jsonError('غير مصرح بالوصول لهذا الطلب.', 403);
      }
    }

    // ── Read the intention's current state from Paymob ─────────────────
    // The classic /api/ecommerce/orders/transaction_inquiry endpoint needs a
    // classic auth token, which this merchant account can no longer issue
    // (verified live 2026-08-04 — /api/auth/tokens returns "incorrect
    // credentials"). The Intention API's element endpoint returns the same
    // authoritative transaction state, keyed by public key + the intention's
    // own client_secret which we persisted at initiate time.
    //
    // Source of truth is still Paymob, never the caller: nothing below reads
    // any client-supplied status.
    if (!existing.paymob_client_secret) {
      // Pre-migration rows (created under the classic flow) have no intention
      // secret. They can only be resolved by the HMAC-verified webhook or by
      // the expiry sweep — never silently completed here.
      console.warn('[check-paymob] no intention client_secret for', merchantOrderId);
      return jsonOk({ status: 'pending' });
    }

    const elementUrl =
      `${PAYMOB_BASE_URL}/v1/intention/element/${encodeURIComponent(PAYMOB_PUBLIC_KEY)}` +
      `/${encodeURIComponent(existing.paymob_client_secret)}/`;

    const inquiryRes = await fetch(elementUrl, {
      method: 'GET',
      headers: { 'Authorization': `Token ${PAYMOB_SECRET_KEY}` },
    });

    if (!inquiryRes.ok) {
      const t = await inquiryRes.text();
      console.warn('[check-paymob] intention lookup failed:', inquiryRes.status, t.substring(0, 200));
      // Don't treat as failure yet — let client keep polling
      return jsonOk({ status: 'pending' });
    }

    const intention = await inquiryRes.json() as {
      status?: string;
      paid?: boolean;
      confirmed?: boolean;
      intention_detail?: { amount?: number };
      redirection_url?: string;
    };

    // See txnFromRedirectionUrl's comment above: this endpoint has no
    // `transactions` array. `paid` is the authoritative success signal;
    // redirection_url's query string is the only place per-transaction detail
    // (id, decline message, ...) is exposed once an attempt has happened.
    const txn: PaymobTxn = txnFromRedirectionUrl(intention.redirection_url) ?? {};

    console.log('[check-paymob] intention state:', JSON.stringify({
      intentionStatus: intention.status,
      paid:            intention.paid,
      confirmed:       intention.confirmed,
      success:         txn?.success,
      pending:         txn?.pending,
      error_occured:   txn?.error_occured,
      id:              txn?.id,
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
        const { data: cancelRes } = await supabase.rpc('cancel_pending_payment', {
          p_merchant_order_id: merchantOrderId,
          p_reason: 'ألغاه العميل (لا توجد معاملة)',
        });
        // حرّر الكوبون فقط لو هذا الاستدعاء هو من حوّل الحالة (يمنع تحريرًا مزدوجًا
        // لو سبقه webhook أو expiry). already=true يعني سبقه غيره فلا نحرّر ثانيةً.
        if (cancelRes?.success && !cancelRes?.already) await releaseCouponIfNeeded();
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
          p_amount_cents:          txn.amount_cents ?? null,
          p_currency:              'EGP',
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
      const { data: cancelRes } = await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason:            txn.data?.message ?? 'فشل الدفع',
      });
      // حرّر الكوبون فقط لو هذا الاستدعاء هو من حوّل الحالة (يمنع التحرير المزدوج).
      if (cancelRes?.success && !cancelRes?.already) await releaseCouponIfNeeded();
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
