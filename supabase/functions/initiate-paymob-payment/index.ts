// ════════════════════════════════════════════════════════════════════════
//  initiate-paymob-payment
//  ──────────────────────────────────────────────────────────────────────
//  • Does NOT create an `orders` row. Instead, it saves the cart + customer
//    info in `pending_payments` (with reserved stock) and returns the
//    Paymob checkout URL.
//  • The real `orders` row is only created later by `paymob-webhook` /
//    `check-paymob-transaction` after Paymob confirms a successful payment.
//
//  Paymob integration: Intention API (secret key), NOT the legacy 3-step
//  classic flow. Verified live 2026-08-04 that this merchant account rejects
//  /api/auth/tokens outright ("incorrect credentials") while /v1/intention
//  accepts the secret key, so the classic path is gone, not misconfigured.
//
//  Security highlights (all unchanged from the classic implementation):
//    – Cart prices / shipping / total are RE-CALCULATED server-side from the
//      products table (the client cannot fake a discount).
//    – Stock is reserved atomically (FOR UPDATE inside the RPC).
//    – A unique merchant_order_id is generated server-side and sent to Paymob
//      as `special_reference`, so webhook callbacks correlate back to it.
//
//  App exemption (2026-08-04): the mobile app cannot render a Cloudflare
//  Turnstile challenge (no browser). A request carrying `x-app-key` equal to
//  APP_DOWNLOAD_SECRET — the same app-only secret already used by
//  create-digital-download-link — is trusted as the published app and skips
//  Turnstile. Any other caller (the website included) still goes through it.
//  Rate limiting and every price/payment verification below still apply
//  regardless of this exemption.
//
//  Login requirement (2026-08-10, widened 2026-08-20): guest checkout is
//  gone everywhere — a signed-in account is required to purchase, on the
//  website and the app alike, so every order has an owner who can see it
//  in "طلباتي" and get the order-status emails.
// ════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PAYMOB_SECRET_KEY = Deno.env.get('PAYMOB_SECRET_KEY') ?? '';
const PAYMOB_PUBLIC_KEY = Deno.env.get('PAYMOB_PUBLIC_KEY') ?? '';
const PAYMOB_BASE_URL = 'https://accept.paymob.com';
// Where Paymob POSTs the transaction-processed callback, and where the buyer
// is sent back to after the checkout completes.
const WEBHOOK_URL = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/paymob-webhook`;
const REDIRECT_URL = Deno.env.get('PAYMOB_REDIRECT_URL') ?? '';
const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
const REQUIRE_TURNSTILE = (Deno.env.get('REQUIRE_TURNSTILE') ?? '').toLowerCase() === 'true';
// Same app-only secret create-digital-download-link already checks. Lets the
// mobile app skip Turnstile (it has no browser to solve the challenge) while
// the website still goes through it.
const APP_KEY_SECRET = Deno.env.get('APP_DOWNLOAD_SECRET') ?? '';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 8;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// Intention API takes integration ids directly in `payment_methods`; the
// legacy per-method iframe ids are no longer used (unified checkout renders
// every enabled method from the single intention).
//
// The integration id for a given payment_methods row now lives in that row's
// own `config.integration_id` (set from the dashboard, no redeploy needed) —
// see the DB lookup below, which is the primary source. This env-var map is
// kept only as a fallback for older rows (card/fawry) that predate that
// column and haven't been migrated into the DB yet.
const INTEGRATION_IDS: Record<string, number> = {
  paymob_card:  Number(Deno.env.get('PAYMOB_CARD_INTEGRATION_ID')  ?? '0'),
  paymob_fawry: Number(Deno.env.get('PAYMOB_FAWRY_INTEGRATION_ID') ?? '0'),
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

// Generate an order id like ORD-YYYYMMDD-<32 hex> (matches the existing pattern).
// The random suffix uses the FULL UUID (128 bits) — not a 6-char slice — so the
// id is unguessable. This prevents enumeration of merchant_order_id, which is the
// lookup key used by the public check-paymob-transaction endpoint.
function generateMerchantOrderId(): string {
  const d = new Date();
  const ymd =
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
  const rand = crypto.randomUUID().replace(/-/g, '');
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

    // Trusted app callers (mobile) skip Turnstile — they cannot render the
    // widget. Everyone else (the website) still must pass it.
    const isTrustedApp = !!APP_KEY_SECRET && req.headers.get('x-app-key') === APP_KEY_SECRET;
    if (!PAYMOB_SECRET_KEY || !PAYMOB_PUBLIC_KEY) {
      return jsonError('مفاتيح Paymob غير مضبوطة', 500);
    }

    const normalizedProvider = String(provider ?? '').toLowerCase().trim();
    if (!normalizedProvider || !normalizedProvider.startsWith('paymob')) {
      return jsonError(`بيانات Paymob غير مضبوطة للطريقة: ${provider}`, 500);
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
    if (!isTrustedApp && !(await verifyTurnstile(turnstileToken, getClientIp(req)))) {
      return jsonError('تعذر التحقق الأمني. حدّث الصفحة وحاول مرة أخرى.', 403);
    }

    // Paymob works with EGP only — reject non-Egyptian countries
    const countryCode = (country?.code ?? '').toUpperCase();
    if (countryCode && countryCode !== 'EG') {
      return jsonError('الدفع الإلكتروني عبر Paymob متاح لمصر فقط حاليًا.');
    }

    // ── Validate the chosen payment method: exists, active, and a Paymob
    //    provider (so a non-Paymob / inactive method can't be forced here).
    //    Also resolves the actual Paymob integration id to charge against —
    //    from this row's own config.integration_id first (dashboard-managed,
    //    no redeploy needed), falling back to the legacy env-var map above
    //    only for rows that haven't been migrated into the DB yet. ──────────
    if (!paymentMethodId) {
      return jsonError('طريقة الدفع مطلوبة.', 400);
    }
    let integrationId = 0;
    {
      const { data: pm, error: pmError } = await supabase
        .from('payment_methods')
        .select('provider, is_active, config')
        .eq('id', paymentMethodId)
        .maybeSingle();
      if (pmError) {
        console.error('[paymob] payment method lookup error:', pmError);
        return jsonError('تعذر التحقق من طريقة الدفع.', 500);
      }
      const pmProvider = String(pm?.provider ?? '').toLowerCase().trim();
      if (!pm || pm.is_active === false || pmProvider !== normalizedProvider || !pmProvider.startsWith('paymob')) {
        return jsonError('طريقة الدفع غير صالحة أو غير متاحة.', 400);
      }
      const configId = Number((pm.config as Record<string, unknown> | null)?.integration_id ?? 0);
      integrationId = configId > 0 ? configId : (INTEGRATION_IDS[normalizedProvider] ?? 0);
      if (!integrationId) {
        console.error('[paymob] no integration id configured for provider:', normalizedProvider);
        return jsonError(`بيانات Paymob غير مضبوطة للطريقة: ${provider}`, 500);
      }
    }

    // ── Auth user ─────────────────────────────────────────────────────
    // Required on every caller now — website and app alike (see header note).
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id ?? null;
    }
    if (!userId) {
      return jsonError('يجب تسجيل الدخول لإتمام عملية الشراء.', 401);
    }

    // ── Re-fetch real prices from DB (don't trust client-supplied price) ───
    // `is_digital` is NOT a column — it's derived from variant_type elsewhere.
    // So we read price columns from DB and derive is_digital from variant_type.
    const variantIds = items.map((i) => i.variant_id).filter(Boolean);
    const { data: variantRows, error: vErr } = await supabase
      .from('product_variants')
      .select('id, product_id, price, sale_price, variant_type, weight_kg')
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
        .select('default_shipping_cost, free_shipping_threshold, default_shipping_company_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const flatRate = Number(settings?.default_shipping_cost) || 45;
      const freeThreshold = Number(settings?.free_shipping_threshold) || 0;
      const defaultCompanyId = settings?.default_shipping_company_id as string | null | undefined;

      // ── Weight + governorate rate lookup — same fallback contract as
      //    create-storefront-order: missing company/governorate/rate just
      //    means the flat rate above applies, never blocks checkout. ──────
      let calculatedRate = flatRate;
      const customerGovernorate = String(customer?.governorate ?? '').trim();
      if (defaultCompanyId && customerGovernorate) {
        const cartWeightKg = items.reduce((sum, it) => {
          const v = variantMap.get(it.variant_id);
          if (!v) return sum;
          const isDigital = v.variant_type === 'رقمي' || v.variant_type === 'digital';
          if (isDigital) return sum;
          const qty = Math.min(99, Math.max(1, Math.floor(Number(it.quantity) || 1)));
          return sum + (Number(v.weight_kg) || 0.3) * qty;
        }, 0);

        const { data: rateRow } = await supabase
          .from('shipping_rates')
          .select('price')
          .eq('shipping_company_id', defaultCompanyId)
          .eq('governorate', customerGovernorate)
          .eq('is_active', true)
          .lte('weight_from_kg', cartWeightKg)
          .or(`weight_to_kg.is.null,weight_to_kg.gte.${cartWeightKg}`)
          .order('weight_from_kg', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (rateRow?.price != null) {
          calculatedRate = Number(rateRow.price);
        }
      }

      // Free shipping threshold only applies to Egypt (matches frontend logic)
      const isEgypt = !countryCode || countryCode === 'EG';
      const qualifiesFreeShipping = isEgypt && freeThreshold > 0 && subtotal >= freeThreshold;

      serverShipping = qualifiesFreeShipping ? 0 : calculatedRate;
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

    // Per-payment client secret: return plaintext to the buyer; store only its
    // SHA-256 hash. The buyer must echo it back to read/cancel the payment.
    const clientSecret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const clientSecretHash = Array.from(new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientSecret)),
    )).map((b) => b.toString(16).padStart(2, '0')).join('');

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

    // Store the client-secret hash on the freshly-created pending payment.
    await supabase
      .from('pending_payments')
      .update({ client_secret_hash: clientSecretHash })
      .eq('merchant_order_id', merchantOrderId);

    // ── Paymob Intention API (single call) ──────────────────────────
    // `special_reference` carries OUR merchantOrderId so the webhook and the
    // status poll can both correlate the callback back to this pending row.
    const nameParts = (customer.fullName ?? '').trim().split(' ');
    const firstName = nameParts[0] || 'NA';
    const lastName  = nameParts.slice(1).join(' ') || 'NA';

    const failAndCleanup = async (reason: string, message: string) => {
      await supabase.rpc('cancel_pending_payment', {
        p_merchant_order_id: merchantOrderId,
        p_reason: reason,
      });
      await releaseCouponIfNeeded();
      return jsonError(message);
    };

    console.log('[paymob] creating intention for', merchantOrderId);
    const intentionRes = await fetch(`${PAYMOB_BASE_URL}/v1/intention/`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${PAYMOB_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount:           totalCents,
        currency:         'EGP',
        payment_methods:  [integrationId],
        special_reference: merchantOrderId,
        notification_url: WEBHOOK_URL,
        ...(REDIRECT_URL ? { redirection_url: REDIRECT_URL } : {}),
        billing_data: {
          apartment:    'NA',
          email:        customer.email ?? 'NA',
          floor:        'NA',
          first_name:   firstName,
          street:       customer.address || 'NA',
          building:     'NA',
          phone_number: customer.phone ?? 'NA',
          postal_code:  'NA',
          city:         customer.city || 'NA',
          country:      country?.code ?? 'EG',
          last_name:    lastName,
          state:        customer.governorate || 'NA',
        },
      }),
    });

    if (!intentionRes.ok) {
      const t = await intentionRes.text();
      console.error('[paymob] intention failed:', intentionRes.status, t.substring(0, 400));
      return await failAndCleanup(
        'Paymob intention failed',
        `تعذر بدء عملية الدفع: ${t.substring(0, 200)}`,
      );
    }

    const intention = await intentionRes.json() as {
      client_secret?: string;
      id?: string;
      intention_order_id?: number;
    };

    if (!intention.client_secret) {
      console.error('[paymob] intention returned no client_secret:', JSON.stringify(intention).substring(0, 300));
      return await failAndCleanup('No client_secret', 'Paymob لم يرسل بيانات الدفع');
    }

    // intention_order_id is what arrives as `obj.order.id` in the webhook, so
    // storing it here keeps complete_pending_payment's order-match check intact.
    await supabase
      .from('pending_payments')
      .update({
        paymob_order_id:      intention.intention_order_id != null
          ? String(intention.intention_order_id)
          : null,
        paymob_client_secret: intention.client_secret,
      })
      .eq('merchant_order_id', merchantOrderId);

    const paymentUrl =
      `${PAYMOB_BASE_URL}/unifiedcheckout/?publicKey=${encodeURIComponent(PAYMOB_PUBLIC_KEY)}` +
      `&clientSecret=${encodeURIComponent(intention.client_secret)}`;

    return jsonOk({
      paymentUrl,
      merchantOrderId,
      clientSecret,
      paymobOrderId: intention.intention_order_id ?? null,
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
