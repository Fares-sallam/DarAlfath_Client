const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAYMOB_API_KEY = Deno.env.get('PAYMOB_API_KEY') ?? '';
const PAYMOB_BASE = 'https://accept.paymob.com/api';

// Integration IDs and iFrame IDs per payment type
// Set these in Supabase Edge Function secrets
const INTEGRATION_IDS: Record<string, string> = {
  paymob_card: Deno.env.get('PAYMOB_CARD_INTEGRATION_ID') ?? '',
  paymob_fawry: Deno.env.get('PAYMOB_FAWRY_INTEGRATION_ID') ?? '',
  paymob_wallet: Deno.env.get('PAYMOB_WALLET_INTEGRATION_ID') ?? '',
};

const IFRAME_IDS: Record<string, string> = {
  paymob_card: Deno.env.get('PAYMOB_CARD_IFRAME_ID') ?? '',
  paymob_fawry: Deno.env.get('PAYMOB_FAWRY_IFRAME_ID') ?? '',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!PAYMOB_API_KEY) {
      return jsonError('PAYMOB_API_KEY غير مضبوط في متغيرات البيئة', 500);
    }

    const { orderId, amountCents, billingData, provider } = await req.json();

    if (!orderId || !amountCents || !provider) {
      return jsonError('بيانات الطلب غير مكتملة');
    }

    const integrationId = INTEGRATION_IDS[provider];
    const iframeId = IFRAME_IDS[provider];

    if (!integrationId || !iframeId) {
      return jsonError(`بيانات Paymob غير مضبوطة لطريقة الدفع: ${provider}`, 500);
    }

    // ── Step 1: Auth ──────────────────────────────────────────────────────────
    const authRes = await fetch(`${PAYMOB_BASE}/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: PAYMOB_API_KEY }),
    });
    const authData = await authRes.json();
    if (!authData.token) {
      return jsonError('فشل في المصادقة مع Paymob - تأكد من صحة API Key');
    }
    const authToken: string = authData.token;

    // ── Step 2: Create Paymob Order ───────────────────────────────────────────
    const paymobOrderRes = await fetch(`${PAYMOB_BASE}/ecommerce/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: amountCents,
        currency: 'EGP',
        merchant_order_id: orderId,
        items: [],
      }),
    });
    const paymobOrderData = await paymobOrderRes.json();
    if (!paymobOrderData.id) {
      return jsonError('فشل في إنشاء الطلب في Paymob');
    }
    const paymobOrderId: number = paymobOrderData.id;

    // ── Step 3: Get Payment Key ───────────────────────────────────────────────
    const keyRes = await fetch(`${PAYMOB_BASE}/acceptance/payment_keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: paymobOrderId,
        billing_data: billingData,
        currency: 'EGP',
        integration_id: Number(integrationId),
        lock_order_when_paid: false,
      }),
    });
    const keyData = await keyRes.json();
    if (!keyData.token) {
      return jsonError('فشل في الحصول على مفتاح الدفع من Paymob');
    }

    const paymentToken: string = keyData.token;
    const paymentUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`;

    return jsonOk({ paymentUrl });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع', 500);
  }
});
