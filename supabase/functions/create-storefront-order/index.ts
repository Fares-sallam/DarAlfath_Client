import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    // Use service role key so the function bypasses RLS and can write to orders
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { customer, paymentMethod, paymentMethodId: clientPaymentMethodId, country, shipping, items, paymentType } = body;
    // paymentType: 'cod' | 'online'  — 'online' = Paymob (no immediate stock deduction)

    // ── Basic validation ──────────────────────────────────────────────────────
    if (!Array.isArray(items) || items.length === 0) {
      return jsonError('لا توجد منتجات في الطلب.');
    }

    if (!customer?.fullName || !customer?.email || !customer?.phone) {
      return jsonError('بيانات العميل غير مكتملة.');
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

    // ── اختيار الـ RPC المناسب حسب نوع الدفع ────────────────────────────────
    // online (Paymob): إنشاء الطلب بدون خصم مخزون — يُخصم بعد تأكيد الدفع
    // cod/bank:        إنشاء الطلب + خصم المخزون فوراً (السلوك الحالي)
    const isOnlinePayment = paymentType === 'online';
    const rpcName = isOnlinePayment
      ? 'create_order_pending_payment'
      : 'create_order_with_stock_deduction';

    console.log(`[create-order] paymentType=${paymentType} → rpc=${rpcName}`);

    const rpcParams = {
      p_user_id: userId,
      p_country_id: country?.id ?? null,
      p_payment_method_id: paymentMethodId,
      p_shipping_cost: Number(shipping) || 0,
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
      p_items: items.map((item: Record<string, unknown>) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: Number(item.quantity) || 1,
        price_per_item: Number(item.price) || 0,
        is_digital: Boolean(item.is_digital),
      })),
    };

    const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, rpcParams);

    if (rpcError) {
      // Surface user-friendly Arabic messages from RAISE EXCEPTION in the RPC
      return jsonError(rpcError.message || 'تعذر إنشاء الطلب في قاعدة البيانات.');
    }

    if (!rpcData?.id) {
      return jsonError('لم ترجع قاعدة البيانات رقم الطلب.');
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
          price_per_item, discount_per_item, is_digital, download_url,
          products(id, title, author, cover_url, type),
          product_variants(id, variant_name)
        )
      `)
      .eq('id', rpcData.id)
      .single();

    if (fetchError || !orderRow) {
      // Order was created successfully — return minimal info even if join fails
      return jsonOk({ order: rpcData });
    }

    return jsonOk({ order: orderRow });
  } catch (err) {
    console.error('create-storefront-order error:', err);
    return jsonError('خطأ داخلي في الخادم. يرجى المحاولة مرة أخرى.', 500);
  }
});
