// ════════════════════════════════════════════════════════════════════════
//  create-digital-download-link
//  Issues a SHORT-lived signed URL for a paid digital order item.
//  Never exposes a public/permanent URL. Requires the buyer's JWT.
// ════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SIGNED_URL_TTL_SECONDS = 90; // 60–120s window
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// Order statuses that are allowed to download even before payment_status flips
// (matches the storefront's "downloadable" states managed from the dashboard).
const ALLOWED_STATUSES = ['تم التأكيد', 'جاري الشحن', 'تم التوصيل'];

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const cur = rateBuckets.get(key);
  if (rateBuckets.size > 2000) {
    for (const [k, b] of rateBuckets) if (b.resetAt <= now) rateBuckets.delete(k);
  }
  if (!cur || cur.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > RATE_LIMIT_MAX;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (rateLimited(`dl:${clientIp(req)}`)) return json({ error: 'محاولات كثيرة. حاول بعد قليل.' }, 429);

  // ── App-only enforcement (fail-closed) ──────────────────────────────────
  // تحميل ملفات الـ PDF متاح من التطبيق فقط. التطبيق يرسل سرًّا مشتركًا في الترويسة
  // x-app-key؛ الموقع لا يعرفه، فلا يستطيع توليد روابط تحميل حتى لو نادى الدالة مباشرةً.
  // لو لم يُضبط السرّ في البيئة → نرفض الجميع (يُغلق أي bypass افتراضيًا).
  const APP_DOWNLOAD_SECRET = Deno.env.get('APP_DOWNLOAD_SECRET') ?? '';
  if (!APP_DOWNLOAD_SECRET || req.headers.get('x-app-key') !== APP_DOWNLOAD_SECRET) {
    return json({ error: 'التحميل متاح من التطبيق فقط.' }, 403);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Require the buyer's JWT ──
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'يجب تسجيل الدخول.' }, 401);
  const { data: userData } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  const caller = userData?.user;
  if (!caller) return json({ error: 'جلسة غير صالحة.' }, 401);
  const callerEmail = (caller.email ?? '').trim().toLowerCase();

  let orderItemId = '';
  try {
    const body = await req.json();
    orderItemId = String(body?.orderItemId ?? '').trim();
  } catch {
    return json({ error: 'طلب غير صالح.' }, 400);
  }
  if (!orderItemId) return json({ error: 'orderItemId مطلوب.' }, 400);

  const audit = async (success: boolean, reason: string, productId?: string | null) => {
    try {
      await supabase.from('download_audit').insert({
        user_id: caller.id,
        order_item_id: orderItemId,
        product_id: productId ?? null,
        success,
        reason,
        ip: clientIp(req),
      });
    } catch (_e) { /* audit must never block download */ }
  };

  // ── Load order item + its order (no client-supplied trust) ──
  const { data: item, error: itemErr } = await supabase
    .from('order_items')
    .select('id, product_id, is_digital, orders!inner(id, user_id, payment_status, status, shipping_address)')
    .eq('id', orderItemId)
    .maybeSingle();

  if (itemErr || !item) { await audit(false, 'item_not_found'); return json({ error: 'العنصر غير موجود.' }, 404); }
  if (!item.is_digital) { await audit(false, 'not_digital', item.product_id); return json({ error: 'هذا المنتج ليس رقميًا.' }, 400); }

  const order = (item as Record<string, unknown>).orders as {
    id: string; user_id: string | null; payment_status: string; status: string;
    shipping_address: { email?: string } | null;
  };

  // ── Ownership: own user, or guest order tied to the caller's verified email ──
  const ownsByUser = order.user_id && order.user_id === caller.id;
  const orderEmail = (order.shipping_address?.email ?? '').trim().toLowerCase();
  const ownsByEmail = !order.user_id && orderEmail && orderEmail === callerEmail;
  if (!ownsByUser && !ownsByEmail) {
    await audit(false, 'not_owner', item.product_id);
    return json({ error: 'غير مصرح بالوصول لهذا الملف.' }, 403);
  }

  // ── Entitlement: paid, or an admin-approved downloadable status ──
  const entitled = order.payment_status === 'paid' || ALLOWED_STATUSES.includes(order.status);
  if (!entitled) {
    await audit(false, 'not_paid', item.product_id);
    return json({ error: 'الطلب غير مدفوع أو بانتظار موافقة الإدارة.' }, 403);
  }

  // ── Resolve internal file path (never a public URL) ──
  const { data: ebook } = await supabase
    .from('electronic_books')
    .select('file_path')
    .eq('product_id', item.product_id)
    .maybeSingle();

  const filePath = (ebook?.file_path ?? '').trim();
  if (!filePath) { await audit(false, 'no_file', item.product_id); return json({ error: 'الملف غير متاح بعد.' }, 404); }

  // ── Short-lived signed URL from the PRIVATE ebooks bucket ──
  const { data: signed, error: signErr } = await supabase
    .storage.from('ebooks')
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    await audit(false, 'sign_failed', item.product_id);
    return json({ error: 'تعذر توليد رابط التحميل.' }, 500);
  }

  await audit(true, 'ok', item.product_id);
  return json({ url: signed.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
});
