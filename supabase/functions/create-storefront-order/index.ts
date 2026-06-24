import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
const REQUIRE_TURNSTILE = (Deno.env.get('REQUIRE_TURNSTILE') ?? '').toLowerCase() === 'true';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 12;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

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
  const key = `create-order:${getClientIp(req)}`;
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
    return 'تم إرسال طلبات كثيرة خلال وقت قصير. حاول مرة أخرى بعد دقائق.';
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
    console.warn('[create-order] Turnstile verification failed:', err);
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

  try {
    // Use service role key so the function bypasses RLS and can write to orders
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { customer, paymentMethod, paymentMethodId: clientPaymentMethodId, country, shipping, items, paymentType, couponCode, turnstileToken } = body;
    // Paymob/online payments must go through initiate-paymob-payment.

    // ── Basic validation ──────────────────────────────────────────────────────
    if (!Array.isArray(items) || items.length === 0) {
      return jsonError('لا توجد منتجات في الطلب.');
    }
    if (items.length > 50) {
      return jsonError('عدد المنتجات في الطلب كبير جداً.');
    }

    if (!customer?.fullName || !customer?.email || !customer?.phone) {
      return jsonError('بيانات العميل غير مكتملة.');
    }
    const customerEmail = String(customer.email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return jsonError('البريد الإلكتروني غير صالح.');
    }
    if (!(await verifyTurnstile(turnstileToken, getClientIp(req)))) {
      return jsonError('تعذر التحقق الأمني. حدّث الصفحة وحاول مرة أخرى.', 403);
    }
    if (paymentType === 'online') {
      return jsonError('الدفع الإلكتروني يجب أن يبدأ عبر بوابة Paymob فقط.');
    }

    // ── Resolve authenticated user (optional) ────────────────────────────────
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id ?? null;
    }

    // ── Upsert profile so admin sees the customer's real name/phone/email ────
    // Runs in the background — never blocks the order.
    if (userId) {
      supabase
        .from('profiles')
        .upsert(
          {
            id:         userId,
            full_name:  customer.fullName,
            email:      customer.email,
            phone:      customer.phone,
            role:       'user',
            is_active:  true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id', ignoreDuplicates: false },
        )
        .then(({ error }) => {
          if (error) console.warn('profiles upsert skipped:', error.message);
        });
    }

    // ── Resolve payment_method_id ─────────────────────────────────────────────
    // If the client already sends the actual DB uuid (new flow), use it directly.
    // Otherwise fall back to fuzzy-matching by provider name (legacy fallback).
    let paymentMethodId: string | null = clientPaymentMethodId ?? null;
    if (!paymentMethodId) {
      const aliasMap: Record<string, string[]> = {
        cod:    ['cash on delivery', 'cod', 'cash', 'delivery'],
        bank:   ['bank', 'transfer', 'visa', 'mastercard'],
        wallet: ['vodafone', 'instapay', 'fawry', 'meeza', 'etisalat', 'mobinil', 'mobile'],
      };
      const aliases = aliasMap[paymentMethod as string] ?? aliasMap.cod;

      const { data: allMethods } = await supabase
        .from('payment_methods')
        .select('id, provider');

      const matched = (allMethods ?? []).find((m) => {
        const prov = (m.provider ?? '').toLowerCase().trim();
        return aliases.some((a) => prov === a || prov.includes(a));
      });
      paymentMethodId = matched?.id ?? null;
    }
    if (!paymentMethodId) {
      return jsonError('طريقة الدفع غير صالحة.');
    }

    const { data: paymentMethodRow, error: paymentMethodError } = await supabase
      .from('payment_methods')
      .select('id, provider, is_active')
      .eq('id', paymentMethodId)
      .maybeSingle();

    if (paymentMethodError || !paymentMethodRow || paymentMethodRow.is_active === false) {
      return jsonError('طريقة الدفع غير متاحة حالياً.');
    }

    const providerName = String(paymentMethodRow.provider ?? '').toLowerCase().trim();
    if (providerName.startsWith('paymob')) {
      return jsonError('طريقة Paymob يجب أن تتم من مسار الدفع الإلكتروني فقط.');
    }

    // ── إعادة جلب الأسعار الحقيقية من قاعدة البيانات (لا نثق بسعر العميل) ──
    // التحقق أن كل عنصر يحتوي على variant_id
    const itemsWithoutVariant = (items as { variant_id?: string }[]).filter(
      (i) => !i.variant_id
    );
    if (itemsWithoutVariant.length > 0) {
      return jsonError('كل المنتجات يجب أن تحتوي على variant_id.');
    }

    const variantIds = (items as { variant_id: string }[])
      .map((i) => i.variant_id);

    const { data: variantRows, error: vErr } = await supabase
      .from('product_variants')
      .select('id, product_id, price, sale_price, variant_type')
      .in('id', variantIds);

    if (vErr || !variantRows || variantRows.length === 0) {
      console.error('[create-order] variant fetch error:', vErr);
      return jsonError('فشل التحقق من أسعار المنتجات.');
    }

    const variantMap = new Map(variantRows.map((v: Record<string, unknown>) => [v.id, v]));

    // التحقق من أن جميع المنتجات موجودة في قاعدة البيانات
    const missingVariants = variantIds.filter((vid) => !variantMap.has(vid));
    if (missingVariants.length > 0) {
      return jsonError(`منتجات غير موجودة: ${missingVariants.join(', ')}`);
    }

    const verifiedItems: Array<{
      product_id: unknown; variant_id: unknown;
      quantity: number; price_per_item: number; is_digital: boolean;
    }> = [];

    for (const item of items as Record<string, unknown>[]) {
      const v = variantMap.get(item.variant_id as string) as Record<string, unknown>;
      const realPrice = Number(v.sale_price ?? v.price);
      if (!Number.isFinite(realPrice) || realPrice <= 0) {
        return jsonError('سعر منتج غير صالح');
      }
      const isDigital =
        v.variant_type === 'رقمي' ||
        v.variant_type === 'digital';
      // Digital items are always quantity 1 (no reason to buy multiple copies)
      const qty = isDigital ? 1 : Math.min(99, Math.max(1, Math.floor(Number(item.quantity) || 1)));
      verifiedItems.push({
        product_id:     v.product_id ?? item.product_id,
        variant_id:     item.variant_id,
        quantity:       qty,
        price_per_item: realPrice,
        is_digital:     isDigital,
      });
    }

    // ── حساب الشحن server-side (لا نثق بقيمة العميل) ─────────────────────
    const hasPhysicalItems = verifiedItems.some((i) => !i.is_digital);
    const verifiedSubtotal = verifiedItems.reduce(
      (sum, i) => sum + i.price_per_item * i.quantity, 0
    );

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
      const isEgypt = !country?.code || (country.code ?? '').toUpperCase() === 'EG';
      const qualifiesFreeShipping = isEgypt && freeThreshold > 0 && verifiedSubtotal >= freeThreshold;

      serverShipping = qualifiesFreeShipping ? 0 : flatRate;
    }

    // ── إنشاء الطلب + خصم المخزون فوراً لطرق الدفع غير Paymob ─────────────
    const rpcName = 'create_order_with_stock_deduction';

    console.log(`[create-order] paymentType=${paymentType} → rpc=${rpcName} serverShipping=${serverShipping}`);

    const rpcParams = {
      p_user_id: userId,
      p_country_id: country?.id ?? null,
      p_payment_method_id: paymentMethodId,
      p_shipping_cost: serverShipping,
      p_shipping_address: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        governorate: customer.governorate ?? '',
        city: customer.city,
        street: customer.address,
        country: country?.name ?? null,
        notes: customer.notes ?? '',
      },
      p_notes: customer.notes ?? '',
      p_items: verifiedItems,
    };

    const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, rpcParams);

    if (rpcError) {
      // Surface user-friendly Arabic messages from RAISE EXCEPTION in the RPC
      return jsonError(rpcError.message || 'تعذر إنشاء الطلب في قاعدة البيانات.');
    }

    if (!rpcData?.id) {
      return jsonError('لم ترجع قاعدة البيانات رقم الطلب.');
    }

    // ── Apply coupon (post-creation UPDATE) ──────────────────────────────────
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
          const validTo = coupon.valid_to ? new Date(coupon.valid_to) : null;

          const subtotal = verifiedItems
            .reduce((sum: number, i) => sum + i.price_per_item * i.quantity, 0);

          let isValid = true;
          if (validFrom && now < validFrom) isValid = false;
          if (validTo && now > validTo) isValid = false;
          if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) isValid = false;
          if (coupon.min_order != null && coupon.min_order > 0 && subtotal < coupon.min_order) isValid = false;
          if (coupon.country_id && coupon.country_id !== (country?.id ?? null)) isValid = false;
          if (coupon.user_id && coupon.user_id !== userId) isValid = false;
          if (coupon.product_id && !verifiedItems.some((i) => i.product_id === coupon.product_id)) isValid = false;

          if (isValid) {
            let discountAmount = 0;
            let newShipping = serverShipping;

            switch (coupon.type) {
              case 'نسبة':
                discountAmount = Math.round(subtotal * coupon.value / 100 * 100) / 100;
                break;
              case 'مبلغ ثابت':
                discountAmount = Math.min(coupon.value, subtotal);
                break;
              case 'شحن مجاني':
                newShipping = 0;
                break;
              case 'خصم منتج': {
                const match = verifiedItems.find((i) => i.product_id === coupon.product_id);
                if (match) {
                  discountAmount = Math.min(coupon.value, match.price_per_item * match.quantity);
                }
                break;
              }
            }

            // ── Atomic: claim coupon via DB-side `used_count + 1` ──
            // Prevents lost updates from concurrent orders.
            // Returns false if coupon is exhausted (used_count >= max_uses).
            const { data: couponClaimed, error: claimError } = await supabase.rpc('claim_coupon', {
              p_coupon_id: coupon.id,
            });
            if (claimError) throw claimError;

            if (couponClaimed) {
              const newTotal = subtotal - discountAmount + newShipping;

              const { error: updateCouponError } = await supabase
                .from('orders')
                .update({
                  coupon_id: coupon.id,
                  discount_amount: discountAmount,
                  shipping_cost: newShipping,
                  total_price: newTotal,
                })
                .eq('id', rpcData.id);

              if (updateCouponError) {
                console.warn('[create-order] Coupon order update failed:', updateCouponError.message);
                try {
                  await supabase.rpc('release_coupon', { p_coupon_code: trimmedCode });
                } catch (releaseErr) {
                  console.warn('[create-order] release_coupon after update failure failed:', releaseErr);
                }
              } else {
                console.log(`[create-order] Coupon ${trimmedCode} applied: discount=${discountAmount} shipping=${newShipping} total=${newTotal}`);
              }
            } else {
              console.log(`[create-order] Coupon ${trimmedCode} exhausted (max_uses=${coupon.max_uses}) — discount NOT applied`);
            }
          }
        }
      } catch (couponErr) {
        console.warn('[create-order] Coupon application failed (non-fatal):', couponErr);
      }
    }

    // ── Fetch the full order (with joins) to return to the client ─────────────
    const { data: orderRow, error: fetchError } = await supabase
      .from('orders')
      .select(`
        id, user_id, country_id, status, total_price, shipping_cost,
        discount_amount, payment_status, tracking_number,
        shipping_address, notes, created_at, updated_at,
        countries(name, currency_symbol),
        payment_methods(method_name, provider),
        shipping_companies(company_name, logo_url),
        order_items(
          id, product_id, variant_id, quantity,
          price_per_item, discount_per_item, is_digital,
          products(id, title, author, cover_url, type),
          product_variants(id, variant_name)
        )
      `)
      .eq('id', rpcData.id)
      .single();

    if (fetchError || !orderRow) {
      // Order was created successfully — return minimal info even if join fails
      // Try to send email even in this degraded path
      try {
        await supabase.functions.invoke('send-order-email', {
          body: { orderId: rpcData.id },
          headers: INTERNAL_FUNCTION_SECRET
            ? { 'x-internal-function-secret': INTERNAL_FUNCTION_SECRET }
            : undefined,
        });
      } catch (e) {
        console.warn('[create-order] email dispatch failed (degraded path):', e);
      }
      return jsonOk({ order: rpcData });
    }

    // Fire-and-forget order confirmation email — never block the order on email failures
    try {
      await supabase.functions.invoke('send-order-email', {
        body: { orderId: rpcData.id },
        headers: INTERNAL_FUNCTION_SECRET
          ? { 'x-internal-function-secret': INTERNAL_FUNCTION_SECRET }
          : undefined,
      });
    } catch (e) {
      console.warn('[create-order] email dispatch failed:', e);
    }

    return jsonOk({ order: orderRow });
  } catch (err) {
    console.error('create-storefront-order error:', err);
    return jsonError('خطأ داخلي في الخادم. يرجى المحاولة مرة أخرى.', 500);
  }
});
