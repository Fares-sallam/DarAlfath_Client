// ════════════════════════════════════════════════════════════════════════
//  secure-login
//  بوابة تسجيل دخول مع قفل ضد التخمين: 5 محاولات فاشلة لنفس البريد → قفل دقيقتين.
//  يُستخدم من صفحة العميل ولوحة التحكم بدل supabase.auth.signInWithPassword.
//  العميل يستلم الجلسة (access/refresh token) ويضبطها بـ supabase.auth.setSession.
// ════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// حد بسيط لكل IP (دفاع في العمق ضد إغراق الدالة).
const RL_WINDOW_MS = 5 * 60 * 1000;
const RL_MAX = 60;
const rl = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (rl.size > 5000) for (const [k, v] of rl) if (v.resetAt <= now) rl.delete(k);
  const b = rl.get(ip);
  if (!b || b.resetAt <= now) { rl.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS }); return false; }
  b.count += 1;
  return b.count > RL_MAX;
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ── Durable rate limit (shared by every instance, survives restarts) ──────────
// The in-memory limit above only sees one instance at a time, so a flood spread over a few
// instances walks past it. This one counts in the database (rate_limit_hits, migration
// 20261110_security_hardening) and fails OPEN: if that call breaks, the request goes on
// rather than the shop going down with it. Each check is [bucket, max hits, window seconds].
// deno-lint-ignore no-explicit-any
async function durableLimitExceeded(admin: any, checks: Array<[string, number, number]>): Promise<boolean> {
  if (checks.length === 0) return false;
  try {
    const { data, error } = await admin.rpc('rate_limit_hits', {
      p_checks: checks.map(([bucket, max, windowSeconds]) => ({ bucket, max, window: windowSeconds })),
    });
    if (error) {
      console.warn('[rate-limit] rpc failed:', error.message);
      return false;
    }
    return typeof data === 'string' && data.length > 0;
  } catch (err) {
    console.warn('[rate-limit] check failed:', err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) return json({ error: 'محاولات كثيرة جدًا. حاول لاحقًا.' }, 429);

  let email = '', password = '', captchaToken = '';
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim();
    password = String(body?.password ?? '');
    // Turnstile token from the browser, handed on to Supabase Auth (checked there when CAPTCHA
    // protection is on; ignored while it is off). A token works once, so it is not checked here.
    captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken.slice(0, 4096) : '';
  } catch {
    return json({ error: 'طلب غير صالح.' }, 400);
  }
  if (!email || !password) return json({ error: 'أدخل البريد الإلكتروني وكلمة المرور.' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // حد دائم لكل IP مشترك بين كل النسخ (الأرقام سخية لأن شبكات الموبايل تشارك عنوانًا واحدًا).
  if (ip !== 'unknown' && await durableLimitExceeded(admin, [[`login:ip:${ip}:5m`, 60, 300]])) {
    return json({ error: 'محاولات كثيرة جدًا. حاول لاحقًا.' }, 429);
  }

  // نحدّد user_id لربط القفل بحساب حقيقي (الإيميل غير الموجود لا يُقفل لكنه يفشل دائمًا).
  const { data: userId } = await admin.rpc('get_user_id_by_email', { p_email: email });

  // ① افحص القفل قبل أي محاولة كلمة سر.
  if (userId) {
    const { data: status } = await admin.rpc('login_throttle_status', { p_user_id: userId });
    if (status?.locked) {
      return json({
        error: `تم قفل الحساب مؤقتًا بسبب محاولات دخول كثيرة. حاول بعد ${status.secs_left ?? 120} ثانية.`,
        locked: true, secsLeft: status.secs_left ?? 120,
      }, 429);
    }
  }

  // ② جرّب الدخول على عميل anon منفصل (server-side، بلا حفظ جلسة).
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });

  // A missing or failed security check says nothing about the password: it must not count toward
  // the lock (or a bot could lock anyone out without ever trying a password).
  if (signErr && /captcha/i.test(signErr.message ?? '')) {
    return json({ error: 'تعذّر التحقق الأمني (أنا لست روبوت). حدّث الصفحة وحاول مرة أخرى.', captcha: true }, 400);
  }

  if (signErr || !signIn?.session) {
    // ③ فشل → سجّل المحاولة (تقفل عند الخامسة).
    if (userId) {
      const { data: rec } = await admin.rpc('record_login_result', { p_user_id: userId, p_success: false });
      if (rec?.locked) {
        return json({
          error: `تم قفل الحساب لمدة دقيقتين بعد 5 محاولات فاشلة. حاول بعد ${rec.secs_left ?? 120} ثانية.`,
          locked: true, secsLeft: rec.secs_left ?? 120,
        }, 429);
      }
    }
    // رسالة عامة (لا نكشف هل البريد موجود).
    return json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' }, 401);
  }

  // ④ نجاح → صفّر العدّاد وأعِد الجلسة.
  if (userId) await admin.rpc('record_login_result', { p_user_id: userId, p_success: true });

  const s = signIn.session;
  return json({
    access_token:  s.access_token,
    refresh_token: s.refresh_token,
    expires_in:    s.expires_in,
    expires_at:    s.expires_at,
    token_type:    s.token_type,
    user:          signIn.user,
  });
});
