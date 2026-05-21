import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    if (success && !pending) {
      // ── دفع ناجح: تأكيد الطلب وخصم المخزون ─────────────────────────────────
      const { data, error } = await supabase.rpc('confirm_online_payment', {
        p_order_id:       merchantOrderId,
        p_transaction_id: transactionId,
      });

      if (error) {
        console.error('[paymob-webhook] confirm_online_payment error:', error.message);
        // Return 500 so Paymob retries — the payment was real but our processing failed
        return new Response(JSON.stringify({ error: 'Internal processing failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log('[paymob-webhook] Order confirmed:', JSON.stringify(data));
    } else if (!pending) {
      // ── دفع فاشل (ليس pending): إلغاء الطلب ─────────────────────────────────
      // Fetch coupon_code BEFORE cancellation changes the row
      const { data: pendingRow } = await supabase
        .from('pending_payments')
        .select('coupon_code')
        .eq('merchant_order_id', merchantOrderId)
        .maybeSingle();

      const { data, error } = await supabase.rpc('cancel_pending_payment_order', {
        p_order_id: merchantOrderId,
      });

      if (error) {
        console.error('[paymob-webhook] cancel_pending_payment_order error:', error.message);
        // Return 500 so Paymob retries — we failed to process the cancellation
        return new Response(JSON.stringify({ error: 'Internal processing failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Release coupon if one was claimed with this pending payment
      if (pendingRow?.coupon_code) {
        try {
          await supabase.rpc('release_coupon', { p_coupon_code: pendingRow.coupon_code });
          console.log(`[paymob-webhook] Coupon ${pendingRow.coupon_code} released`);
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
    // نرجع 200 عشان Paymob ما يعيدش المحاولة بشكل متكرر
    return jsonOk({ received: true, error: err instanceof Error ? err.message : 'unknown' });
  }
});
