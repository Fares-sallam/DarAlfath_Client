// ════════════════════════════════════════════════════════════════════════
//  delete-account
//  ──────────────────────────────────────────────────────────────────────
//  Lets a signed-in user permanently delete their own account, in-app —
//  required by both Apple (App Store Review Guideline 5.1.1(v)) and Google
//  Play's account-deletion policy for any app that supports account
//  creation.
//
//  Only ever acts on the caller's OWN user id, resolved from their own
//  Authorization bearer token — the request body carries no target user id,
//  so there is no way to delete anyone else's account through this
//  endpoint.
//
//  Personal data (profile, wishlist, reviews, digital access log) is
//  deleted outright. Orders are NOT deleted — order/order_items rows stay
//  for revenue and accounting history — but they're anonymized: user_id is
//  detached and the personal fields inside shipping_address (name, email,
//  phone, street, notes) are scrubbed. The Supabase Auth user itself is
//  deleted last, since that's what actually revokes login access; every
//  step before it is best-effort and non-fatal so one missing/renamed
//  table can't block the rest of the deletion.
// ════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Resolve the caller strictly from their own token ──────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError('يجب تسجيل الدخول لحذف الحساب.', 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userErr || !userId) {
      return jsonError('تعذر التحقق من الحساب. سجّل الدخول وحاول مرة أخرى.', 401);
    }

    // ── Delete personal data. Each step is independent and non-fatal ──────
    const cleanup = async (label: string, run: () => Promise<{ error: any }>) => {
      try {
        const { error } = await run();
        if (error) console.warn(`[delete-account] ${label} failed:`, error.message);
      } catch (e) {
        console.warn(`[delete-account] ${label} threw:`, e);
      }
    };

    await cleanup('wishlist',           () => supabase.from('wishlist').delete().eq('user_id', userId));
    await cleanup('reviews',            () => supabase.from('reviews').delete().eq('user_id', userId));
    await cleanup('digital_access_log', () => supabase.from('digital_access_log').delete().eq('user_id', userId));

    // ── Orders: anonymize, don't delete — keeps revenue/accounting history
    //    and order_items integrity intact while scrubbing PII. ────────────
    try {
      const { data: userOrders } = await supabase
        .from('orders')
        .select('id, shipping_address')
        .eq('user_id', userId);

      for (const order of userOrders ?? []) {
        const addr = (order.shipping_address ?? {}) as Record<string, unknown>;
        await supabase
          .from('orders')
          .update({
            user_id: null,
            shipping_address: {
              ...addr,
              name:   'مستخدم محذوف',
              email:  null,
              phone:  null,
              street: null,
              notes:  null,
            },
          })
          .eq('id', order.id);
      }
    } catch (e) {
      console.warn('[delete-account] order anonymization threw:', e);
    }

    await cleanup('profiles', () => supabase.from('profiles').delete().eq('id', userId));

    // ── Finally, delete the actual Auth user — this is what revokes login
    //    access, and is the one step that must succeed. ────────────────────
    const { error: authDeleteErr } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteErr) {
      console.error('[delete-account] auth.admin.deleteUser failed:', authDeleteErr);
      return jsonError('تعذر حذف الحساب بالكامل. حاول مرة أخرى أو تواصل مع الدعم.', 500);
    }

    return jsonOk({ success: true });
  } catch (err) {
    console.error('[delete-account] Unexpected:', err);
    return jsonError('خطأ داخلي في الخادم. حاول مرة أخرى.', 500);
  }
});
