const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Secret Key (يبدأ بـ egy_sk_live_ أو egy_sk_test_) — يُستخدم في Authorization header
const PAYMOB_API_KEY    = Deno.env.get('PAYMOB_API_KEY')    ?? '';
// Public Key (يبدأ بـ egy_pk_live_ أو egy_pk_test_) — يُستخدم في رابط Unified Checkout
const PAYMOB_PUBLIC_KEY = Deno.env.get('PAYMOB_PUBLIC_KEY') ?? '';

// Integration IDs per payment type (من eg.paymob.com → Developers → Integrations)
const INTEGRATION_IDS: Record<string, number> = {
  paymob_card:   Number(Deno.env.get('PAYMOB_CARD_INTEGRATION_ID')   ?? '0'),
  paymob_fawry:  Number(Deno.env.get('PAYMOB_FAWRY_INTEGRATION_ID')  ?? '0'),
  paymob_wallet: Number(Deno.env.get('PAYMOB_WALLET_INTEGRATION_ID') ?? '0'),
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
    console.log('[paymob] API_KEY length:', PAYMOB_API_KEY.length, '| PUBLIC_KEY length:', PAYMOB_PUBLIC_KEY.length);
    console.log('[paymob] INTEGRATION_IDS:', JSON.stringify(INTEGRATION_IDS));

    if (!PAYMOB_API_KEY) {
      return jsonError('PAYMOB_API_KEY غير مضبوط في متغيرات البيئة', 500);
    }
    if (!PAYMOB_PUBLIC_KEY) {
      return jsonError('PAYMOB_PUBLIC_KEY غير مضبوط (مطلوب لـ Unified Checkout)', 500);
    }

    const body = await req.json();
    const { orderId, amountCents, billingData, provider } = body;

    console.log('[paymob] Request:', JSON.stringify({ orderId, amountCents, provider }));

    if (!orderId || !amountCents || !provider) {
      return jsonError('بيانات الطلب غير مكتملة');
    }

    const integrationId = INTEGRATION_IDS[provider];

    console.log('[paymob] provider:', provider, '| integrationId:', integrationId);

    if (!integrationId) {
      return jsonError(`Integration ID غير مضبوط لطريقة الدفع: ${provider}`, 500);
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

    // ── بناء رابط الدفع (Unified Checkout — النمط الجديد 2025) ────────────────
    // الـ URL ده هو الـ hosted checkout page الجديدة من Paymob
    // بتستخدم publicKey + clientSecret بدل iframeId + payment_token القديم
    const paymentUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${PAYMOB_PUBLIC_KEY}&clientSecret=${clientSecret}`;
    console.log('[paymob] Success! Unified Checkout URL built.');

    return jsonOk({ paymentUrl });
  } catch (err) {
    console.error('[paymob] Unexpected error:', err);
    return jsonError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع', 500);
  }
});
