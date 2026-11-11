import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// HMAC Secret من Paymob — إجباري للتحقق من أصل الطلب
const PAYMOB_HMAC_SECRET = Deno.env.get('PAYMOB_HMAC_SECRET') ?? '';
const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonStatus(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Compares two hex strings in time that does not depend on where they differ.
function timingSafeEqualHex(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// التحقق من HMAC إذا كان السر مضبوطاً
async function verifyHmac(body: Record<string, unknown>, receivedHmac: string): Promise<boolean> {
  if (!PAYMOB_HMAC_SECRET) {
    console.error('[paymob-webhook] PAYMOB_HMAC_SECRET غير مضبوط — يتم رفض الطلب');
    return false;
  }

  const obj = (body.obj ?? {}) as Record<string, unknown>;
  const order = (obj.order ?? {}) as Record<string, unknown>;
  const sourceData = (obj.source_data ?? {}) as Record<string, unknown>;

  // ترتيب الحقول حسب Paymob Classic API
  const fields = [
    String(obj.amount_cents   ?? ''),
    String(obj.created_at     ?? ''),
    String(obj.currency       ?? ''),
    String(obj.error_occured  ?? ''),
    String(obj.has_parent_transaction ?? ''),
    String(obj.id             ?? ''),
    String(obj.integration_id ?? ''),
    String(obj.is_3d_secure   ?? ''),
    String(obj.is_auth        ?? ''),
    String(obj.is_capture     ?? ''),
    String(obj.is_refunded    ?? ''),
    String(obj.is_standalone_payment ?? ''),
    String(obj.is_voided      ?? ''),
    String(order.id           ?? ''),
    String(obj.owner          ?? ''),
    String(obj.pending        ?? ''),
    String(sourceData.pan     ?? ''),
    String(sourceData.sub_type ?? ''),
    String(sourceData.type    ?? ''),
    String(obj.success        ?? ''),
  ];

  const message = fields.join('');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(PAYMOB_HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const computed = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqualHex(computed, receivedHmac);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonStatus(405, { error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return jsonStatus(400, { error: 'Invalid body' });
    }

    // Paymob also posts other kinds of callbacks (card tokens, delivery status) to the same
    // address. They carry nothing to fulfil, so they are acknowledged and left alone.
    if (typeof body.type === 'string' && body.type !== 'TRANSACTION') {
      console.log(`[paymob-webhook] Ignoring callback of type ${body.type}`);
      return jsonOk({ received: true, ignored: true });
    }

    // ── Paymob Intention API callback ─────────────────────────────────────────
    // body.obj.success, body.obj.id, body.obj.order.merchant_order_id
    const obj = (body.obj ?? {}) as Record<string, unknown>;

    // HMAC verification — إجباري دائماً.
    // Paymob's documentation sends the signature as the `hmac` query parameter of the
    // callback URL; older payloads carried it in the body, so both are accepted.
    let receivedHmac = '';
    try {
      receivedHmac = new URL(req.url).searchParams.get('hmac') || '';
    } catch { /* fall through to the body */ }
    if (!receivedHmac) receivedHmac = String(body.hmac ?? '');

    if (!receivedHmac) {
      console.warn('[paymob-webhook] No HMAC received — rejecting');
      return jsonStatus(401, { error: 'Missing HMAC' });
    }
    const hmacValid = await verifyHmac(body, receivedHmac);
    if (!hmacValid) {
      console.warn('[paymob-webhook] Invalid HMAC signature');
      return jsonStatus(401, { error: 'Invalid signature' });
    }

    const transactionId = String(obj.id ?? '');
    const success       = obj.success === true;
    const pending       = obj.pending === true;

    // استخراج رقم طلبنا من Paymob order
    const paymobOrder       = (obj.order ?? {}) as Record<string, unknown>;
    const merchantOrderId   = String(
      paymobOrder.merchant_order_id ?? obj.merchant_order_id ?? ''
    );

    console.log(`[paymob-webhook] orderId=${merchantOrderId} success=${success} pending=${pending} txId=${transactionId}`);

    // A refund or a void is its own transaction (success: true, is_refund / is_void: true) on
    // the same order. It must never be read as a new payment, nor cancel an order that was paid.
    if (obj.is_refund === true || obj.is_void === true || obj.is_refunded === true || obj.is_voided === true) {
      console.log(`[paymob-webhook] Refund/void callback for ${merchantOrderId} — nothing to fulfil`);
      return jsonOk({ received: true, ignored: true });
    }

    if (!merchantOrderId) {
      console.warn('[paymob-webhook] No merchant_order_id found');
      return jsonOk({ received: true });
    }

    const { data: existingPayment, error: lookupError } = await supabase
      .from('pending_payments')
      .select('status, resulting_order_id, paymob_order_id, coupon_code')
      .eq('merchant_order_id', merchantOrderId)
      .maybeSingle();

    if (lookupError) {
      console.error('[paymob-webhook] pending_payments lookup failed:', lookupError.message);
      // Let Paymob try again later.
      return jsonStatus(500, { error: 'Internal processing failed' });
    }

    if (!existingPayment) {
      // Not one of ours (another integration of the same Paymob account, or a made-up id).
      console.warn(`[paymob-webhook] No pending payment for ${merchantOrderId} — ignoring`);
      return jsonOk({ received: true, unknown: true });
    }

    if (existingPayment.status === 'completed') {
      console.log(`[paymob-webhook] Payment already completed for ${merchantOrderId}`);
      return jsonOk({ received: true, already: true, orderId: existingPayment.resulting_order_id });
    }

    if (!success && !pending && (
      existingPayment.status === 'failed' ||
      existingPayment.status === 'cancelled' ||
      existingPayment.status === 'expired'
    )) {
      console.log(`[paymob-webhook] Payment already closed as ${existingPayment.status} for ${merchantOrderId}`);
      return jsonOk({ received: true, already: true });
    }

    if (success && !pending) {
      // ── دفع ناجح: تأكيد الطلب وخصم المخزون ─────────────────────────────────
      // Also reaches rows closed earlier (a declined first card, 30 minutes passed): the
      // function turns a confirmed payment into an order whatever the row says.
      const { data, error } = await supabase.rpc('complete_pending_payment', {
        p_merchant_order_id:     merchantOrderId,
        p_paymob_order_id:       String(paymobOrder.id ?? existingPayment.paymob_order_id ?? ''),
        p_paymob_transaction_id: transactionId,
        p_amount_cents:          obj.amount_cents != null ? Number(obj.amount_cents) : null,
        p_currency:              String(obj.currency ?? 'EGP'),
      });

      if (error) {
        console.error('[paymob-webhook] complete_pending_payment error:', error.message);
        // Return 500 so Paymob retries — the payment was real but our processing failed
        return jsonStatus(500, { error: 'Internal processing failed' });
      }

      if (data?.success) {
        console.log('[paymob-webhook] Order confirmed:', JSON.stringify(data));
        // Only the call that created the order sends the confirmation email.
        if (!data.already && data.order_id) {
          try {
            await supabase.functions.invoke('send-order-email', {
              body: { orderId: data.order_id },
              headers: INTERNAL_FUNCTION_SECRET
                ? { 'x-internal-function-secret': INTERNAL_FUNCTION_SECRET }
                : undefined,
            });
          } catch (e) {
            console.warn('[paymob-webhook] email dispatch failed:', e);
          }
        }
      } else if (data?.paid_unfulfilled) {
        // Paid, but the order could not be made (for instance the last copy sold meanwhile).
        // The database recorded it and told the admins; retrying would change nothing.
        console.error('[paymob-webhook] PAID WITHOUT ORDER:', merchantOrderId, data.error);
      } else {
        console.error('[paymob-webhook] complete_pending_payment refused:', data?.error);
        // Return 500 so Paymob retries and the failure stays visible on its side.
        return jsonStatus(500, { error: 'Internal processing failed' });
      }
    } else if (!pending) {
      // ── دفع فاشل (ليس pending): إلغاء الطلب ─────────────────────────────────
      const failureData = (obj.data ?? {}) as Record<string, unknown>;
      const { data, error } = await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: String(failureData.message ?? 'فشل الدفع'),
      });

      if (error) {
        console.error('[paymob-webhook] cancel_pending_payment error:', error.message);
        // Return 500 so Paymob retries — we failed to process the cancellation
        return jsonStatus(500, { error: 'Internal processing failed' });
      }

      // Release coupon ONLY if this call actually transitioned the payment.
      // data.already=true يعني أن check-paymob أو expiry سبقنا للتحرير → لا نكرّره.
      if (existingPayment.coupon_code && data?.success && !data?.already) {
        try {
          await supabase.rpc('release_coupon', { p_coupon_code: existingPayment.coupon_code });
          console.log(`[paymob-webhook] Coupon ${existingPayment.coupon_code} released`);
        } catch (e) {
          console.warn('[paymob-webhook] release_coupon failed:', e);
        }
      }

      console.log('[paymob-webhook] Order cancelled:', JSON.stringify(data));
    } else {
      console.log('[paymob-webhook] Payment still pending, waiting...');
    }

    // Paymob يتوقع 200 OK دائماً
    return jsonOk({ received: true });
  } catch (err) {
    console.error('[paymob-webhook] Unexpected error:', err);
    // Return 500 so Paymob retries unexpected processing failures (no details to the caller).
    return jsonStatus(500, { error: 'Internal error' });
  }
});
