import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RL_WINDOW_MS = 5 * 60 * 1000;
const RL_MAX = 40;
const rlBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(req: Request): boolean {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const b = rlBuckets.get(ip);
  if (rlBuckets.size > 2000) for (const [k, v] of rlBuckets) if (v.resetAt <= now) rlBuckets.delete(k);
  if (!b || b.resetAt <= now) { rlBuckets.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS }); return false; }
  b.count += 1; return b.count > RL_MAX;
}

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type CouponRow = {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order: number | null;
  max_uses: number | null;
  used_count: number;
  product_id: string | null;
  country_id: string | null;
  user_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
};

type ItemInput = { product_id: string; variant_id?: string; quantity: number; price?: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonOk({ valid: false, error: 'Method not allowed' });
  }
  if (rateLimited(req)) {
    return jsonOk({ valid: false, error: 'محاولات كثيرة. حاول بعد قليل.' });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve authenticated user (optional)
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id ?? null;
    }

    const body = await req.json();
    const {
      code,
      subtotal,
      shipping,
      countryId,
      items,
    } = body as {
      code: string;
      subtotal: number;
      shipping: number;
      countryId: string | null;
      items: ItemInput[];
    };

    if (!code?.trim()) {
      return jsonOk({ valid: false, error: 'أدخل كود الخصم.' });
    }

    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .eq('is_active', true)
      .maybeSingle();

    if (error || !coupon) {
      return jsonOk({ valid: false, error: 'كود الخصم غير صالح.' });
    }

    const c = coupon as CouponRow;
    const now = new Date();

    // ── إعادة حساب المبالغ server-side من أسعار DB (لا نثق بالعميل) ──────────
    // نطابق منطق initiate-paymob-payment: سعر النسخة من product_variants
    // (sale_price ?? price)، والشحن من store_settings. سعر/subtotal العميل
    // يُستخدم فقط كـ fallback انتقالي لو العميل القديم لم يرسل variant_id.
    const itemList: ItemInput[] = Array.isArray(items) ? items : [];
    const variantIds = itemList.map((i) => i.variant_id).filter(Boolean) as string[];
    let serverSubtotal = 0;
    let hasPhysical = false;
    const lineByProduct = new Map<string, number>();
    if (variantIds.length) {
      const { data: variantRows } = await supabase
        .from('product_variants')
        .select('id, product_id, price, sale_price, variant_type')
        .in('id', variantIds);
      const vmap = new Map((variantRows ?? []).map((v) => [v.id, v]));
      for (const it of itemList) {
        const v = vmap.get(it.variant_id as string);
        if (!v) continue;
        const realPrice = Number(v.sale_price ?? v.price);
        if (!Number.isFinite(realPrice) || realPrice <= 0) continue;
        const isDigital = v.variant_type === 'رقمي' || v.variant_type === 'digital';
        if (!isDigital) hasPhysical = true;
        const qty = isDigital ? 1 : Math.min(99, Math.max(1, Math.floor(Number(it.quantity) || 1)));
        serverSubtotal += realPrice * qty;
        lineByProduct.set(v.product_id, (lineByProduct.get(v.product_id) ?? 0) + realPrice * qty);
      }
    }
    const resolved = serverSubtotal > 0;
    const effSubtotal = resolved ? serverSubtotal : (Number(subtotal) || 0);

    // الشحن server-side (للعرض في كوبون الشحن المجاني)
    let effShipping = Number(shipping) || 0;
    if (resolved) {
      if (!hasPhysical) {
        effShipping = 0;
      } else {
        const { data: settings } = await supabase
          .from('store_settings')
          .select('default_shipping_cost, free_shipping_threshold')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const flatRate = Number(settings?.default_shipping_cost) || 45;
        const freeThreshold = Number(settings?.free_shipping_threshold) || 0;
        let isEgypt = true;
        if (countryId) {
          const { data: cty } = await supabase.from('countries').select('code').eq('id', countryId).maybeSingle();
          isEgypt = !cty?.code || cty.code === 'EG';
        }
        effShipping = (isEgypt && freeThreshold > 0 && effSubtotal >= freeThreshold) ? 0 : flatRate;
      }
    }

    const productIds = resolved
      ? [...lineByProduct.keys()]
      : itemList.map((i) => i.product_id);

    if (c.valid_from && now < new Date(c.valid_from)) {
      return jsonOk({ valid: false, error: 'كود الخصم لم يبدأ بعد.' });
    }
    if (c.valid_to && now > new Date(c.valid_to)) {
      return jsonOk({ valid: false, error: 'كود الخصم منتهي الصلاحية.' });
    }
    if (c.max_uses != null && c.used_count >= c.max_uses) {
      return jsonOk({ valid: false, error: 'كود الخصم وصل للحد الأقصى من الاستخدام.' });
    }
    if (c.min_order != null && c.min_order > 0 && effSubtotal < c.min_order) {
      return jsonOk({ valid: false, error: `الحد الأدنى للطلب ${c.min_order} للاستفادة من هذا الكود.` });
    }
    if (c.country_id && c.country_id !== countryId) {
      return jsonOk({ valid: false, error: 'كود الخصم غير متاح لبلدك.' });
    }
    if (c.user_id && c.user_id !== userId) {
      return jsonOk({ valid: false, error: 'كود الخصم مخصص لمستخدم آخر.' });
    }
    if (c.product_id && !productIds.includes(c.product_id)) {
      return jsonOk({ valid: false, error: 'كود الخصم خاص بمنتج غير موجود في سلتك.' });
    }

    let calculatedAmount = 0;
    let freeShipping = false;
    let description = '';

    switch (c.type) {
      case 'نسبة':
        calculatedAmount = Math.round(effSubtotal * c.value / 100 * 100) / 100;
        description = `خصم ${c.value}%`;
        break;
      case 'مبلغ ثابت':
        calculatedAmount = Math.min(c.value, effSubtotal);
        description = `خصم ${c.value}`;
        break;
      case 'شحن مجاني':
        freeShipping = true;
        calculatedAmount = effShipping;
        description = 'شحن مجاني';
        break;
      case 'خصم منتج': {
        let lineTotal = 0;
        if (resolved) {
          lineTotal = lineByProduct.get(c.product_id ?? '') ?? 0;
        } else {
          const match = itemList.find((i) => i.product_id === c.product_id);
          if (match) lineTotal = (Number(match.price) || 0) * match.quantity;
        }
        calculatedAmount = Math.min(c.value, lineTotal);
        description = 'خصم على المنتج';
        break;
      }
    }

    return jsonOk({
      valid: true,
      couponId: c.id,
      discount: {
        type: c.type,
        value: c.value,
        calculatedAmount,
        freeShipping,
        description,
      },
    });
  } catch (err) {
    console.error('[validate-coupon] Error:', err);
    return jsonOk({ valid: false, error: 'حدث خطأ أثناء التحقق من الكود.' });
  }
});
