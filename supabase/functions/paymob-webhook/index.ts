import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// HMAC Secret من Paymob — إجباري للتحقق من أصل الطلب
const PAYMOB_HMAC_SECRET = Deno.env.get('PAYMOB_HMAC_SECRET') ?? '';

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

  return computed === receivedHmac;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json() as Record<string, unknown>;
    console.log('[paymob-webhook] Received:', JSON.stringify(body).substring(0, 500));

    // ── Paymob Intention API callback ─────────────────────────────────────────
    // body.obj.success, body.obj.id, body.obj.order.merchant_order_id
    // body.hmac (for HMAC verification)
    const obj = (body.obj ?? {}) as Record<string, unknown>;

    // HMAC verification — إجباري دائماً
    const receivedHmac = String(body.hmac ?? '');
    if (!receivedHmac) {
      console.warn('[paymob-webhook] No HMAC received — rejecting');
      return new Response(JSON.stringify({ error: 'Missing HMAC' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const hmacValid = await verifyHmac(body, receivedHmac);
    if (!hmacValid) {
      console.warn('[paymob-webhook] Invalid HMAC signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    if (!merchantOrderId) {
      console.warn('[paymob-webhook] No merchant_order_id found');
      return jsonOk({ received: true });
    }

    const { data: existingPayment } = await supabase
      .from('pending_payments')
      .select('status, resulting_order_id, paymob_order_id, coupon_code')
      .eq('merchant_order_id', merchantOrderId)
      .maybeSingle();

    if (existingPayment?.status === 'completed') {
      console.log(`[paymob-webhook] Payment already completed for ${merchantOrderId}`);
      return jsonOk({ received: true, already: true, orderId: existingPayment.resulting_order_id });
    }

    if (!success && !pending && (
      existingPayment?.status === 'failed' ||
      existingPayment?.status === 'cancelled' ||
      existingPayment?.status === 'expired'
    )) {
      console.log(`[paymob-webhook] Payment already closed as ${existingPayment.status} for ${merchantOrderId}`);
      return jsonOk({ received: true, already: true });
    }

    if (success && !pending) {
      // ── دفع ناجح: تأكيد الطلب وخصم المخزون ─────────────────────────────────
      const { data, error } = await supabase.rpc('complete_pending_payment', {
        p_merchant_order_id:     merchantOrderId,
        p_paymob_order_id:       String(paymobOrder.id ?? existingPayment?.paymob_order_id ?? ''),
        p_paymob_transaction_id: transactionId,
        p_amount_cents:          obj.amount_cents != null ? Number(obj.amount_cents) : null,
        p_currency:              String(obj.currency ?? 'EGP'),
      });

      if (error || !data?.success) {
        console.error('[paymob-webhook] complete_pending_payment error:', error?.message ?? data?.error);
        // Return 500 so Paymob retries — the payment was real but our processing failed
        return new Response(JSON.stringify({ error: 'Internal processing failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log('[paymob-webhook] Order confirmed:', JSON.stringify(data));
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
        return new Response(JSON.stringify({ error: 'Internal processing failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Release coupon ONLY if this call actually transitioned the payment.
      // data.already=true يعني أن check-paymob أو expiry سبقنا للتحرير → لا نكرّره.
      if (existingPayment?.coupon_code && data?.success && !data?.already) {
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
    // Return 500 so Paymob retries unexpected processing failures.
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
