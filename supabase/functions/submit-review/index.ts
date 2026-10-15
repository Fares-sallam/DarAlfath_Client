import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// A customer's comment on a book: a name, a rating and the comment itself, from anyone, signed in or not.
// It is saved as "pending" (the table's trigger makes sure of that whatever is sent) and shows on the
// store only once approved in the dashboard (تقييمات العملاء). A signed-in customer has one comment per
// book: sending again edits it (and it waits for approval again).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
const REQUIRE_TURNSTILE = (Deno.env.get('REQUIRE_TURNSTILE') ?? '').toLowerCase() === 'true';

// Per address: a few comments in a short while is a person; more is a script.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 6;
const buckets = new Map<string, { count: number; resetAt: number }>();

const clientIp = (req: Request) =>
  req.headers.get('cf-connecting-ip') ||
  req.headers.get('x-real-ip') ||
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  'unknown';

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (buckets.size > 2000) for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX;
}

async function turnstileOk(token: unknown, ip: string): Promise<boolean> {
  if (!REQUIRE_TURNSTILE) return true;
  if (!TURNSTILE_SECRET_KEY || typeof token !== 'string' || !token) return false;
  try {
    const form = new FormData();
    form.set('secret', TURNSTILE_SECRET_KEY);
    form.set('response', token);
    if (ip !== 'unknown') form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    if (!res.ok) return false;
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch (err) {
    console.warn('[submit-review] Turnstile check failed:', err);
    return false;
  }
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => reply({ error: message }, status);

/** Spaces tidied; control characters (other than a line break) dropped. */
const clean = (value: unknown, keepLines = false) =>
  String(value ?? '')
    .replace(keepLines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  const ip = clientIp(req);
  if (rateLimited(ip)) return fail('أرسلت تعليقات كثيرة في وقت قصير. حاول مرة أخرى بعد قليل.', 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('الطلب غير صالح.');
  }

  // A field people can't see: only a script fills it in. Answered as if it worked.
  if (clean(body.website)) return reply({ ok: true, status: 'pending' });

  const productId = String(body.product_id ?? '');
  const name = clean(body.reviewer_name);
  const comment = clean(body.comment, true);
  const rating = Number(body.rating);

  if (!UUID.test(productId)) return fail('الكتاب غير معروف.');
  if (name.length < 2 || name.length > 60) return fail('اكتب اسمك (من حرفين إلى 60 حرفًا).');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail('اختر تقييمًا من نجمة إلى 5 نجوم.');
  if (comment.length < 3) return fail('اكتب تعليقك (3 أحرف على الأقل).');
  if (comment.length > 1000) return fail('التعليق طويل: الحد الأقصى 1000 حرف.');
  if (!(await turnstileOk(body.turnstileToken, ip))) return fail('تعذّر التحقق الأمني. حدّث الصفحة وحاول مرة أخرى.', 403);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let userId: string | null = null;
    const auth = req.headers.get('Authorization');
    if (auth?.startsWith('Bearer ')) {
      const { data } = await supabase.auth.getUser(auth.slice(7));
      userId = data?.user?.id ?? null;
    }

    const { data: product } = await supabase.from('products').select('id').eq('id', productId).eq('is_active', true).maybeSingle();
    if (!product) return fail('هذا الكتاب غير متاح.', 404);

    const row = { product_id: productId, user_id: userId, reviewer_name: name, rating, comment, status: 'pending' };

    if (userId) {
      const { error } = await supabase.from('product_reviews').upsert(row, { onConflict: 'product_id,user_id' });
      if (error) throw error;
    } else {
      // The same comment sent twice (a double click, a retry) is kept once.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: same } = await supabase
        .from('product_reviews')
        .select('id')
        .eq('product_id', productId)
        .is('user_id', null)
        .eq('reviewer_name', name)
        .eq('comment', comment)
        .gte('created_at', since)
        .limit(1);
      if (!same?.length) {
        const { error } = await supabase.from('product_reviews').insert(row);
        if (error) throw error;
      }
    }

    return reply({ ok: true, status: 'pending' });
  } catch (err) {
    console.error('[submit-review] failed:', err);
    return fail('تعذّر حفظ التعليق. حاول مرة أخرى بعد قليل.', 500);
  }
});
