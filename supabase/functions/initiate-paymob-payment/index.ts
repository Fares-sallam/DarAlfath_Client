const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAYMOB_API_KEY = Deno.env.get('PAYMOB_API_KEY') ?? '';

// Integration IDs per payment type (from eg.dashboard.paymob.com → Payment Integrations)
const INTEGRATION_IDS: Record<string, number> = {
  paymob_card:   Number(Deno.env.get('PAYMOB_CARD_INTEGRATION_ID')   ?? '0'),
  paymob_fawry:  Number(Deno.env.get('PAYMOB_FAWRY_INTEGRATION_ID')  ?? '0'),
  paymob_wallet: Number(Deno.env.get('PAYMOB_WALLET_INTEGRATION_ID') ?? '0'),
};

// iFrame IDs per payment type (from eg.dashboard.paymob.com → Iframes)
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

    // ── Paymob Intention API (v1) ─────────────────────────────────────────────
    // يستخدم API Key مباشرةً في الـ Authorization header (بدون Auth step)
    console.log('[paymob] Calling Paymob Intention API...');

    const intentionPayload = {
      amount: amountCents,
      currency: 'EGP',
      payment_methods: [integrationId],
      items: [],
      billing_data: {
        apartment:       billingData.apartment       || 'N/A',
        email:           billingData.email           || 'N/A',
        floor:           billingData.floor           || 'N/A',
        first_name:      billingData.first_name      || 'N/A',
        street:          billingData.street          || 'N/A',
        building:        billingData.building        || 'N/A',
        phone_number:    billingData.phone_number    || 'N/A',
        shipping_method: 'NA',
        postal_code:     'NA',
        city:            billingData.city            || 'N/A',
        country:         billingData.country         || 'EG',
        last_name:       billingData.last_name       || 'N/A',
        state:           billingData.state           || 'N/A',
      },
      customer: {
        first_name:   billingData.first_name   || 'N/A',
        last_name:    billingData.last_name    || 'N/A',
        email:        billingData.email        || 'N/A',
        phone_number: billingData.phone_number || 'N/A',
      },
      special_reference: orderId,
    };

    console.log('[paymob] Intention payload:', JSON.stringify(intentionPayload));

    const intentionRes = await fetch('https://accept.paymob.com/v1/intention/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${PAYMOB_API_KEY}`,
      },
      body: JSON.stringify(intentionPayload),
    });

    const intentionText = await intentionRes.text();
    console.log('[paymob] Intention response status:', intentionRes.status, '| body:', intentionText.substring(0, 600));

    if (!intentionRes.ok) {
      return jsonError(`فشل في إنشاء طلب الدفع في Paymob (${intentionRes.status}): ${intentionText.substring(0, 300)}`);
    }

    let intentionData: { client_secret?: string; id?: string };
    try {
      intentionData = JSON.parse(intentionText);
    } catch {
      return jsonError(`رد غير صالح من Paymob: ${intentionText.substring(0, 200)}`);
    }

    const clientSecret = intentionData?.client_secret;
    console.log('[paymob] client_secret received:', !!clientSecret, '| length:', clientSecret?.length ?? 0);

    if (!clientSecret) {
      return jsonError(`لم يصل client_secret من Paymob. الرد: ${intentionText.substring(0, 300)}`);
    }

    // ── بناء رابط الدفع ──────────────────────────────────────────────────────
    // نستخدم الـ iFrame مع الـ client_secret كـ payment_token
    const paymentUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${clientSecret}`;
    console.log('[paymob] Success! paymentUrl iframeId:', iframeId);

    return jsonOk({ paymentUrl });
  } catch (err) {
    console.error('[paymob] Unexpected error:', err);
    return jsonError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع', 500);
  }
});
