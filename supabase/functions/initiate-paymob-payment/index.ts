// ════════════════════════════════════════════════════════════════════════
//  initiate-paymob-payment
//  ──────────────────────────────────────────────────────────────────────
//  • Does NOT create an `orders` row. Instead, it saves the cart + customer
//    info in `pending_payments` (with reserved stock) and returns the
//    Paymob iframe URL.
//  • The real `orders` row is only created later by `check-paymob-transaction`
//    after Paymob confirms a successful payment.
//
//  Security highlights:
//    – Cart prices / shipping / total are RE-CALCULATED server-side from the
//      products table (the client cannot fake a discount).
//    – Stock is reserved atomically (FOR UPDATE inside the RPC).
//    – A unique merchant_order_id is generated server-side.
// ════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAYMOB_API_KEY = Deno.env.get('PAYMOB_API_KEY') ?? '';

const INTEGRATION_IDS: Record<string, number> = {
  paymob_card:   Number(Deno.env.get('PAYMOB_CARD_INTEGRATION_ID')   ?? '0'),
  paymob_fawry:  Number(Deno.env.get('PAYMOB_FAWRY_INTEGRATION_ID')  ?? '0'),
  paymob_wallet: Number(Deno.env.get('PAYMOB_WALLET_INTEGRATION_ID') ?? '0'),
};

const IFRAME_IDS: Record<string, string> = {
  paymob_card:   Deno.env.get('PAYMOB_CARD_IFRAME_ID')   ?? '',
  paymob_fawry:  Deno.env.get('PAYMOB_FAWRY_IFRAME_ID')  ?? '',
  paymob_wallet: Deno.env.get('PAYMOB_WALLET_IFRAME_ID') ?? '',
};

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Generate an order id like ORD-YYYYMMDD-xxxxxx (matches the existing pattern)
function generateMerchantOrderId(): string {
  const d = new Date();
  const ymd =
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
  return `ORD-${ymd}-${rand}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!PAYMOB_API_KEY) {
      return jsonError('PAYMOB_API_KEY غير مضبوط', 500);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const {
      provider,
      customer,
      country,
      paymentMethodId,
      shipping,
      items,
      couponCode,
    } = body as {
      provider: string;
      customer: Record<string, string>;
      country: { id?: string; code?: string; name?: string } | null;
      paymentMethodId: string | null;
      shipping: number;
      items: Array<{
        product_id: string;
        variant_id: string;
        quantity: number;
        price?: number;          // client-suggested — NOT trusted
        is_digital?: boolean;
      }>;
      couponCode?: string | null;
    };

    if (!provider || !INTEGRATION_IDS[provider]) {
      return jsonError(`بيانات Paymob غير مضبوطة للطريقة: ${provider}`, 500);
    }
    if (!IFRAME_IDS[provider]) {
      return jsonError(`Iframe ID غير مضبوط للطريقة: ${provider}`, 500);
    }
    if (!Array.isArray(items) || items.length === 0) {
      return jsonError('السلة فارغة');
    }
    if (!customer?.fullName || !customer?.email || !customer?.phone) {
      return jsonError('بيانات العميل غير مكتملة');
    }

    // ── Auth user (optional, for guest checkout) ────────────────────
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id ?? null;
    }

    // ── Re-fetch real prices from DB (don't trust client) ───────────
    const variantIds = items.map((i) => i.variant_id).filter(Boolean);
    const { data: variantRows, error: vErr } = await supabase
      .from('product_variants')
      .select('id, product_id, price, sale_price, is_digital')
      .in('id', variantIds);

    if (vErr) {
      console.error('[paymob] variant fetch error:', vErr);
      return jsonError(`فشل التحقق من المنتجات: ${vErr.message}`);
    }
    if (!variantRows || variantRows.length === 0) {
      return jsonError('لم نجد أي منتجات بهذه المعرّفات');
    }

    const variantMap = new Map(variantRows.map((v) => [v.id, v]));
    const normalizedItems: Array<Record<string, unknown>> = [];
    let subtotal = 0;

    for (const it of items) {
      const v = variantMap.get(it.variant_id);
      if (!v) {
        return jsonError(`منتج غير موجود: ${it.variant_id}`);
      }
      const realPrice = Number(v.sale_price ?? v.price);
      if (!Number.isFinite(realPrice) || realPrice <= 0) {
        return jsonError('سعر منتج غير صالح');
      }
      const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
      subtotal += realPrice * qty;
      normalizedItems.push({
        product_id: v.product_id,
        variant_id: v.id,
        quantity:   qty,
        price:      realPrice,
        is_digital: Boolean(v.is_digital),
      });
    }

    const shippingNum = Math.max(0, Number(shipping) || 0);
    const totalCents = Math.round((subtotal + shippingNum) * 100);

    // ── Generate merchant order id ──────────────────────────────────
    const merchantOrderId = generateMerchantOrderId();

    // ── Create pending payment + reserve stock (atomic) ─────────────
    const { error: rpcError } = await supabase.rpc('create_pending_payment', {
      p_merchant_order_id: merchantOrderId,
      p_user_id:           userId,
      p_country_id:        country?.id ?? null,
      p_payment_method_id: paymentMethodId,
      p_amount_cents:      totalCents,
      p_shipping_cost:     shippingNum,
      p_shipping_address: {
        name:        customer.fullName,
        email:       customer.email,
        phone:       customer.phone,
        governorate: customer.governorate ?? '',
        city:        customer.city ?? '',
        street:      customer.address ?? '',
        country:     country?.name ?? null,
        notes:       customer.notes ?? '',
      },
      p_notes:       customer.notes ?? '',
      p_items:       normalizedItems,
      p_coupon_code: couponCode ?? null,
    });

    if (rpcError) {
      console.error('[paymob] create_pending_payment error:', rpcError);
      return jsonError(rpcError.message || 'تعذر حجز المنتجات');
    }

    // ── Paymob Legacy Auth API (3 steps) ────────────────────────────
    console.log('[paymob] Step 1/3: auth token');
    const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ api_key: PAYMOB_API_KEY }),
    });
    if (!authRes.ok) {
      const t = await authRes.text();
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: 'Paymob auth failed',
      });
      return jsonError(`فشل التوثيق مع Paymob: ${t.substring(0, 200)}`);
    }
    const { token: authToken } = await authRes.json();
    if (!authToken) {
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: 'No auth token',
      });
      return jsonError('Paymob لم يرسل auth_token');
    }

    console.log('[paymob] Step 2/3: register order');
    const regRes = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token:        authToken,
        delivery_needed:   'false',
        amount_cents:      String(totalCents),
        currency:          'EGP',
        items:             [],
        merchant_order_id: merchantOrderId,
      }),
    });
    if (!regRes.ok) {
      const t = await regRes.text();
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: 'Paymob register failed',
      });
      return jsonError(`فشل تسجيل الطلب في Paymob: ${t.substring(0, 200)}`);
    }
    const { id: paymobOrderId } = await regRes.json();
    if (!paymobOrderId) {
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: 'No paymob order id',
      });
      return jsonError('Paymob لم يرسل order_id');
    }

    // Save paymob_order_id back to pending_payments
    await supabase
      .from('pending_payments')
      .update({ paymob_order_id: String(paymobOrderId) })
      .eq('merchant_order_id', merchantOrderId);

    console.log('[paymob] Step 3/3: payment key');
    const nameParts = (customer.fullName ?? '').trim().split(' ');
    const firstName = nameParts[0] || 'NA';
    const lastName  = nameParts.slice(1).join(' ') || 'NA';

    const pkRes = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token:     authToken,
        amount_cents:   String(totalCents),
        expiration:     1800,
        order_id:       paymobOrderId,
        currency:       'EGP',
        integration_id: INTEGRATION_IDS[provider],
        billing_data: {
          apartment:       'NA',
          email:           customer.email ?? 'NA',
          floor:           'NA',
          first_name:      firstName,
          street:          customer.address ?? 'NA',
          building:        'NA',
          phone_number:    customer.phone ?? 'NA',
          shipping_method: 'NA',
          postal_code:     'NA',
          city:            customer.city ?? 'NA',
          country:         country?.code ?? 'EG',
          last_name:       lastName,
          state:           customer.governorate ?? 'NA',
        },
      }),
    });
    if (!pkRes.ok) {
      const t = await pkRes.text();
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: 'Paymob payment_key failed',
      });
      return jsonError(`فشل توليد payment_key: ${t.substring(0, 200)}`);
    }
    const { token: paymentToken } = await pkRes.json();
    if (!paymentToken) {
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: 'No payment token',
      });
      return jsonError('Paymob لم يرسل payment_token');
    }

    const paymentUrl =
      `https://accept.paymob.com/api/acceptance/iframes/${IFRAME_IDS[provider]}?payment_token=${paymentToken}`;

    return jsonOk({
      paymentUrl,
      merchantOrderId,
      paymobOrderId,
      amountCents: totalCents,
    });
  } catch (err) {
    console.error('[paymob] Unexpected error:', err);
    return jsonError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع', 500);
  }
});
