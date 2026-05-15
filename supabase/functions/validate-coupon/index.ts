import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

type ItemInput = { product_id: string; quantity: number; price: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    if (c.valid_from && now < new Date(c.valid_from)) {
      return jsonOk({ valid: false, error: 'كود الخصم لم يبدأ بعد.' });
    }
    if (c.valid_to && now > new Date(c.valid_to)) {
      return jsonOk({ valid: false, error: 'كود الخصم منتهي الصلاحية.' });
    }
    if (c.max_uses != null && c.used_count >= c.max_uses) {
      return jsonOk({ valid: false, error: 'كود الخصم وصل للحد الأقصى من الاستخدام.' });
    }
    if (c.min_order != null && c.min_order > 0 && subtotal < c.min_order) {
      return jsonOk({ valid: false, error: `الحد الأدنى للطلب ${c.min_order} للاستفادة من هذا الكود.` });
    }
    if (c.country_id && c.country_id !== countryId) {
      return jsonOk({ valid: false, error: 'كود الخصم غير متاح لبلدك.' });
    }
    if (c.user_id && c.user_id !== userId) {
      return jsonOk({ valid: false, error: 'كود الخصم مخصص لمستخدم آخر.' });
    }
    if (c.product_id && !(items ?? []).some((i: ItemInput) => i.product_id === c.product_id)) {
      return jsonOk({ valid: false, error: 'كود الخصم خاص بمنتج غير موجود في سلتك.' });
    }

    let calculatedAmount = 0;
    let freeShipping = false;
    let description = '';

    switch (c.type) {
      case 'نسبة':
        calculatedAmount = Math.round(subtotal * c.value / 100 * 100) / 100;
        description = `خصم ${c.value}%`;
        break;
      case 'مبلغ ثابت':
        calculatedAmount = Math.min(c.value, subtotal);
        description = `خصم ${c.value}`;
        break;
      case 'شحن مجاني':
        freeShipping = true;
        calculatedAmount = Number(shipping) || 0;
        description = 'شحن مجاني';
        break;
      case 'خصم منتج': {
        const match = (items ?? []).find((i: ItemInput) => i.product_id === c.product_id);
        if (match) {
          const lineTotal = match.price * match.quantity;
          calculatedAmount = Math.min(c.value, lineTotal);
        }
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
