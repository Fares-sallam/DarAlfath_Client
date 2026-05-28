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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PAYMOB_API_KEY = Deno.env.get('PAYMOB_API_KEY') ?? '';
const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
const REQUIRE_TURNSTILE = (Deno.env.get('REQUIRE_TURNSTILE') ?? '').toLowerCase() === 'true';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 8;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

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

function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function getRateLimitError(req: Request): string | null {
  const now = Date.now();
  const key = `paymob:${getClientIp(req)}`;
  const current = rateBuckets.get(key);

  if (rateBuckets.size > 1000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }

  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  current.count += 1;
  if (current.count > RATE_LIMIT_MAX) {
    return 'تم إرسال طلبات دفع كثيرة خلال وقت قصير. حاول مرة أخرى بعد دقائق.';
  }
  return null;
}

async function verifyTurnstile(token: string | null | undefined, clientIp: string): Promise<boolean> {
  if (!REQUIRE_TURNSTILE) return true;
  if (!TURNSTILE_SECRET_KEY || !token) return false;

  try {
    const formData = new FormData();
    formData.set('secret', TURNSTILE_SECRET_KEY);
    formData.set('response', token);
    if (clientIp !== 'unknown') formData.set('remoteip', clientIp);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) return false;

    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  } catch (err) {
    console.warn('[paymob] Turnstile verification failed:', err);
    return false;
  }
}

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
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }
  const rateLimitError = getRateLimitError(req);
  if (rateLimitError) {
    return jsonError(rateLimitError, 429);
  }

  // Track coupon claim at handler scope so the catch block can release it
  let _claimedCouponCode: string | null = null;

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
      turnstileToken,
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
      turnstileToken?: string | null;
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
    if (items.length > 50) {
      return jsonError('عدد المنتجات في الطلب كبير جداً.');
    }
    if (!customer?.fullName || !customer?.email || !customer?.phone) {
      return jsonError('بيانات العميل غير مكتملة');
    }
    const customerEmail = String(customer.email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return jsonError('البريد الإلكتروني غير صالح');
    }
    if (!(await verifyTurnstile(turnstileToken, getClientIp(req)))) {
      return jsonError('تعذر التحقق الأمني. حدّث الصفحة وحاول مرة أخرى.', 403);
    }

    // Paymob works with EGP only — reject non-Egyptian countries
    const countryCode = (country?.code ?? '').toUpperCase();
    if (countryCode && countryCode !== 'EG') {
      return jsonError('الدفع الإلكتروني عبر Paymob متاح لمصر فقط حاليًا.');
    }

    // ── Auth user (optional, for guest checkout) ────────────────────
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id ?? null;
    }

    // ── Re-fetch real prices from DB (don't trust client-supplied price) ───
    // The product_variants table in this project only has: id, product_id,
    // variant_name, variant_type, sku, price, base_price, sale_price, cost_price.
    // `is_digital` is NOT a column — it's derived from variant_type elsewhere.
    // So we read price columns from DB and derive is_digital from variant_type.
    const variantIds = items.map((i) => i.variant_id).filter(Boolean);
    const { data: variantRows, error: vErr } = await supabase
      .from('product_variants')
      .select('id, product_id, price, sale_price, variant_type')
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
      // Derive is_digital from variant_type only (never trust client flag)
      const isDigital =
        v.variant_type === 'رقمي' ||
        v.variant_type === 'digital';
      // Digital items are always quantity 1 (no reason to buy multiple copies)
      const qty = isDigital ? 1 : Math.min(99, Math.max(1, Math.floor(Number(it.quantity) || 1)));
      subtotal += realPrice * qty;
      // Use the field name expected by the existing create_order_with_stock_deduction RPC
      normalizedItems.push({
        product_id:     v.product_id,
        variant_id:     v.id,
        quantity:       qty,
        price_per_item: realPrice,
        is_digital:     isDigital,
      });
    }

    // ── حساب الشحن server-side (لا نثق بقيمة العميل) ─────────────
    const hasPhysicalItems = normalizedItems.some((i) => !i.is_digital);
    let serverShipping = 0;
    if (hasPhysicalItems) {
      const { data: settings } = await supabase
        .from('store_settings')
        .select('default_shipping_cost, free_shipping_threshold')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const flatRate = Number(settings?.default_shipping_cost) || 45;
      const freeThreshold = Number(settings?.free_shipping_threshold) || 0;

      // Free shipping threshold only applies to Egypt (matches frontend logic)
      const isEgypt = !countryCode || countryCode === 'EG';
      const qualifiesFreeShipping = isEgypt && freeThreshold > 0 && subtotal >= freeThreshold;

      serverShipping = qualifiesFreeShipping ? 0 : flatRate;
    }

    // ── تطبيق الكوبون على المبلغ قبل إرساله لـ Paymob ─────────────
    let discountAmount = 0;
    let finalShipping = serverShipping;

    if (couponCode) {
      try {
        const trimmedCode = String(couponCode).trim().toUpperCase();
        const { data: coupon } = await supabase
          .from('coupons')
          .select('*')
          .eq('code', trimmedCode)
          .eq('is_active', true)
          .maybeSingle();

        if (coupon) {
          const now = new Date();
          const validFrom = coupon.valid_from ? new Date(coupon.valid_from) : null;
          const validTo   = coupon.valid_to   ? new Date(coupon.valid_to)   : null;

          let isValid = true;
          if (validFrom && now < validFrom) isValid = false;
          if (validTo && now > validTo) isValid = false;
          if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) isValid = false;
          if (coupon.min_order != null && coupon.min_order > 0 && subtotal < coupon.min_order) isValid = false;
          if (coupon.country_id && coupon.country_id !== (country?.id ?? null)) isValid = false;
          if (coupon.user_id && coupon.user_id !== userId) isValid = false;
          if (coupon.product_id && !normalizedItems.some((i) => i.product_id === coupon.product_id)) isValid = false;

          if (isValid) {
            switch (coupon.type) {
              case 'نسبة':
                discountAmount = Math.round(subtotal * coupon.value / 100 * 100) / 100;
                break;
              case 'مبلغ ثابت':
                discountAmount = Math.min(coupon.value, subtotal);
                break;
              case 'شحن مجاني':
                finalShipping = 0;
                break;
              case 'خصم منتج': {
                const match = normalizedItems.find((i) => i.product_id === coupon.product_id);
                if (match) {
                  discountAmount = Math.min(
                    coupon.value,
                    Number(match.price_per_item) * Number(match.quantity),
                  );
                }
                break;
              }
            }
            // Claim the coupon atomically (DB-side used_count + 1).
            // If exhausted, discard the discount so the customer pays full price.
            const { data: claimed } = await supabase.rpc('claim_coupon', {
              p_coupon_id: coupon.id,
            });
            if (!claimed) {
              console.log(`[paymob] Coupon ${trimmedCode} exhausted — discount reverted`);
              discountAmount = 0;
              finalShipping = serverShipping;
            } else {
              _claimedCouponCode = trimmedCode;   // track for catch-block cleanup
              console.log(`[paymob] Coupon ${trimmedCode} claimed: discount=${discountAmount} shipping=${finalShipping}`);
            }
          }
        }
      } catch (couponErr) {
        console.warn('[paymob] Coupon check failed (non-fatal):', couponErr);
      }
    }

    const totalCents = Math.round((subtotal - discountAmount + finalShipping) * 100);

    // Helper: release the coupon if we claimed it but payment setup fails
    async function releaseCouponIfNeeded() {
      if (_claimedCouponCode) {
        try {
          await supabase.rpc('release_coupon', { p_coupon_code: _claimedCouponCode });
          console.log(`[paymob] Coupon ${_claimedCouponCode} released after failure`);
          _claimedCouponCode = null;
        } catch (e) {
          console.warn('[paymob] release_coupon failed:', e);
        }
      }
    }

    // ── Generate merchant order id ──────────────────────────────────
    const merchantOrderId = generateMerchantOrderId();

    // ── Create pending payment + reserve stock (atomic) ─────────────
    const { error: rpcError } = await supabase.rpc('create_pending_payment', {
      p_merchant_order_id: merchantOrderId,
      p_user_id:           userId,
      p_country_id:        country?.id ?? null,
      p_payment_method_id: paymentMethodId,
      p_amount_cents:      totalCents,
      p_shipping_cost:     finalShipping,
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
      p_coupon_code: _claimedCouponCode,
    });

    if (rpcError) {
      console.error('[paymob] create_pending_payment error:', rpcError);
      await releaseCouponIfNeeded();
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
      await releaseCouponIfNeeded();
      return jsonError(`فشل التوثيق مع Paymob: ${t.substring(0, 200)}`);
    }
    const { token: authToken } = await authRes.json();
    if (!authToken) {
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: 'No auth token',
      });
      await releaseCouponIfNeeded();
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
      await releaseCouponIfNeeded();
      return jsonError(`فشل تسجيل الطلب في Paymob: ${t.substring(0, 200)}`);
    }
    const { id: paymobOrderId } = await regRes.json();
    if (!paymobOrderId) {
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: 'No paymob order id',
      });
      await releaseCouponIfNeeded();
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
        lock_order_when_paid: true,   // prevent double-charging on same order
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
      await releaseCouponIfNeeded();
      return jsonError(`فشل توليد payment_key: ${t.substring(0, 200)}`);
    }
    const { token: paymentToken } = await pkRes.json();
    if (!paymentToken) {
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: 'No payment token',
      });
      await releaseCouponIfNeeded();
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
    // Release coupon if it was claimed before the error occurred
    if (_claimedCouponCode) {
      try {
        const sb = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        await sb.rpc('release_coupon', { p_coupon_code: _claimedCouponCode });
        console.log(`[paymob] Coupon ${_claimedCouponCode} released after unexpected error`);
      } catch (e) {
        console.warn('[paymob] release_coupon in catch failed:', e);
      }
    }
    return jsonError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع', 500);
  }
});
