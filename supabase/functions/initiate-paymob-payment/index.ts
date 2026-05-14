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
    // ── Debug: log env vars presence ────────────────────────────────────────
    console.log('[paymob] PAYMOB_API_KEY set:', !!PAYMOB_API_KEY, '| length:', PAYMOB_API_KEY.length);
    console.log('[paymob] INTEGRATION_IDS:', JSON.stringify(INTEGRATION_IDS));
    console.log('[paymob] IFRAME_IDS:', JSON.stringify(IFRAME_IDS));

    if (!PAYMOB_API_KEY) {
      return jsonError('PAYMOB_API_KEY غير مضبوط في متغيرات البيئة', 500);
    }

    const body = await req.json();
    const { orderId, amountCents, billingData, provider } = body;

    console.log('[paymob] Request body:', JSON.stringify({ orderId, amountCents, provider, billingData }));

    if (!orderId || !amountCents || !provider) {
      console.log('[paymob] Missing required fields');
      return jsonError('بيانات الطلب غير مكتملة');
    }

    const integrationId = INTEGRATION_IDS[provider];
    const iframeId = IFRAME_IDS[provider];

    console.log('[paymob] Provider:', provider, '| integrationId:', integrationId, '| iframeId:', iframeId);

    if (!integrationId || !iframeId) {
      return jsonError(`بيانات Paymob غير مضبوطة لطريقة الدفع: ${provider}`, 500);
    }

    // ── Step 1: Auth ──────────────────────────────────────────────────────────
    console.log('[paymob] Step 1: Authenticating...');
    const authRes = await fetch(`${PAYMOB_BASE}/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: PAYMOB_API_KEY }),
    });
    const authText = await authRes.text();
    console.log('[paymob] Auth response status:', authRes.status, '| body:', authText.substring(0, 500));

    let authData: { token?: string };
    try { authData = JSON.parse(authText); } catch { authData = {}; }

    if (!authData.token) {
      return jsonError(`فشل في المصادقة مع Paymob (${authRes.status}): ${authText.substring(0, 200)}`);
    }
    const authToken: string = authData.token;
    console.log('[paymob] Auth OK, token length:', authToken.length);

    // ── Step 2: Create Paymob Order ───────────────────────────────────────────
    console.log('[paymob] Step 2: Creating Paymob order...');
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
    const paymobOrderText = await paymobOrderRes.text();
    console.log('[paymob] Order response status:', paymobOrderRes.status, '| body:', paymobOrderText.substring(0, 500));

    let paymobOrderData: { id?: number };
    try { paymobOrderData = JSON.parse(paymobOrderText); } catch { paymobOrderData = {}; }

    if (!paymobOrderData.id) {
      return jsonError(`فشل في إنشاء الطلب في Paymob (${paymobOrderRes.status}): ${paymobOrderText.substring(0, 200)}`);
    }
    const paymobOrderId: number = paymobOrderData.id;
    console.log('[paymob] Paymob order created, id:', paymobOrderId);

    // ── Step 3: Get Payment Key ───────────────────────────────────────────────
    console.log('[paymob] Step 3: Getting payment key...');
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
    const keyText = await keyRes.text();
    console.log('[paymob] Payment key response status:', keyRes.status, '| body:', keyText.substring(0, 500));

    let keyData: { token?: string };
    try { keyData = JSON.parse(keyText); } catch { keyData = {}; }

    if (!keyData.token) {
      return jsonError(`فشل في الحصول على مفتاح الدفع من Paymob (${keyRes.status}): ${keyText.substring(0, 200)}`);
    }

    const paymentToken: string = keyData.token;
    const paymentUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`;

    console.log('[paymob] Success! Payment URL ready, iframeId:', iframeId);
    return jsonOk({ paymentUrl });
  } catch (err) {
    console.error('[paymob] Unexpected error:', err);
    return jsonError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع', 500);
  }
});
