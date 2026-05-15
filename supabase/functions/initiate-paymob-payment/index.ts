const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// API Key (للـ Auth API القديم) — من Paymob Dashboard → Developers → API Keys → API key
const PAYMOB_API_KEY = Deno.env.get('PAYMOB_API_KEY') ?? '';

// Integration IDs (من Paymob Dashboard → Developers → Payment Integrations)
const INTEGRATION_IDS: Record<string, number> = {
  paymob_card:   Number(Deno.env.get('PAYMOB_CARD_INTEGRATION_ID')   ?? '0'),
  paymob_fawry:  Number(Deno.env.get('PAYMOB_FAWRY_INTEGRATION_ID')  ?? '0'),
  paymob_wallet: Number(Deno.env.get('PAYMOB_WALLET_INTEGRATION_ID') ?? '0'),
};

// Iframe IDs (من Paymob Dashboard → Developers → Iframes)
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[paymob] API_KEY length:', PAYMOB_API_KEY.length);
    console.log('[paymob] INTEGRATION_IDS:', JSON.stringify(INTEGRATION_IDS));
    console.log('[paymob] IFRAME_IDS:', JSON.stringify(IFRAME_IDS));

    if (!PAYMOB_API_KEY) {
      return jsonError('PAYMOB_API_KEY غير مضبوط في متغيرات البيئة', 500);
    }

    const body = await req.json();
    const { orderId, amountCents, billingData, provider } = body;

    console.log('[paymob] Request:', JSON.stringify({ orderId, amountCents, provider }));

    if (!orderId || !amountCents || !provider) {
      return jsonError('بيانات الطلب غير مكتملة');
    }

    const integrationId = INTEGRATION_IDS[provider];
    const iframeId = IFRAME_IDS[provider];

    console.log('[paymob] provider:', provider, '| integrationId:', integrationId, '| iframeId:', iframeId);

    if (!integrationId || !iframeId) {
      return jsonError(`بيانات Paymob غير مضبوطة لطريقة الدفع: ${provider}`, 500);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Paymob Legacy Auth API Flow (3 خطوات)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── Step 1: Auth Token ──────────────────────────────────────────────
    console.log('[paymob] Step 1/3: getting auth token...');
    const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: PAYMOB_API_KEY }),
    });

    const authText = await authRes.text();
    console.log('[paymob] Auth response status:', authRes.status);

    if (!authRes.ok) {
      return jsonError(`فشل التوثيق مع Paymob (${authRes.status}): ${authText.substring(0, 200)}`);
    }

    let authData: { token?: string };
    try {
      authData = JSON.parse(authText);
    } catch {
      return jsonError(`رد غير صالح من Paymob auth: ${authText.substring(0, 200)}`);
    }

    const authToken = authData?.token;
    if (!authToken) {
      return jsonError(`لم يصل auth_token من Paymob. الرد: ${authText.substring(0, 200)}`);
    }

    // ─── Step 2: Register Order ──────────────────────────────────────────
    console.log('[paymob] Step 2/3: registering order...');
    const registerRes = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        delivery_needed: 'false',
        amount_cents: String(amountCents),
        currency: 'EGP',
        items: [],
        merchant_order_id: orderId,
      }),
    });

    const registerText = await registerRes.text();
    console.log('[paymob] Register response status:', registerRes.status);

    if (!registerRes.ok) {
      return jsonError(`فشل تسجيل الطلب في Paymob (${registerRes.status}): ${registerText.substring(0, 200)}`);
    }

    let registerData: { id?: number };
    try {
      registerData = JSON.parse(registerText);
    } catch {
      return jsonError(`رد غير صالح من Paymob orders: ${registerText.substring(0, 200)}`);
    }

    const paymobOrderId = registerData?.id;
    if (!paymobOrderId) {
      return jsonError(`لم يصل paymob_order_id. الرد: ${registerText.substring(0, 200)}`);
    }

    // ─── Step 3: Payment Key ─────────────────────────────────────────────
    console.log('[paymob] Step 3/3: generating payment key...');
    const paymentKeyRes = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token:    authToken,
        amount_cents:  String(amountCents),
        expiration:    3600,
        order_id:      paymobOrderId,
        currency:      'EGP',
        integration_id: integrationId,
        billing_data: {
          apartment:    billingData?.apartment    || 'NA',
          email:        billingData?.email        || 'NA',
          floor:        billingData?.floor        || 'NA',
          first_name:   billingData?.first_name   || 'NA',
          street:       billingData?.street       || 'NA',
          building:     billingData?.building     || 'NA',
          phone_number: billingData?.phone_number || 'NA',
          shipping_method: 'NA',
          postal_code:  'NA',
          city:         billingData?.city         || 'NA',
          country:      billingData?.country      || 'EG',
          last_name:    billingData?.last_name    || 'NA',
          state:        billingData?.state        || 'NA',
        },
      }),
    });

    const paymentKeyText = await paymentKeyRes.text();
    console.log('[paymob] Payment key response status:', paymentKeyRes.status);

    if (!paymentKeyRes.ok) {
      return jsonError(`فشل توليد payment_key (${paymentKeyRes.status}): ${paymentKeyText.substring(0, 200)}`);
    }

    let paymentKeyData: { token?: string };
    try {
      paymentKeyData = JSON.parse(paymentKeyText);
    } catch {
      return jsonError(`رد غير صالح من payment_keys: ${paymentKeyText.substring(0, 200)}`);
    }

    const paymentToken = paymentKeyData?.token;
    if (!paymentToken) {
      return jsonError(`لم يصل payment_token. الرد: ${paymentKeyText.substring(0, 200)}`);
    }

    // ─── Build Iframe URL ────────────────────────────────────────────────
    const paymentUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`;
    console.log('[paymob] ✅ Success! Iframe URL built for iframeId:', iframeId);

    return jsonOk({ paymentUrl });
  } catch (err) {
    console.error('[paymob] Unexpected error:', err);
    return jsonError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع', 500);
  }
});
