/* A fresh Cloudflare Turnstile token for one Supabase Auth request (sign-up, sign-in, a code by email,
   a password reset). Supabase checks it when "CAPTCHA protection" is on in Auth settings; while it is
   off the token is simply ignored, so this can ship before the switch is turned on.

   A token works once, so every protected request asks for its own. Most people never see anything:
   the widget only shows (in a small card at the bottom of the screen) when Cloudflare wants a click.
   With no site key (VITE_TURNSTILE_SITE_KEY), or if the check can't load, it returns undefined and
   the request goes out without one: Supabase then answers with a captcha error the forms explain.
   Kept identical in the storefront and the dashboard. */

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove?: (id: string) => void;
};

const SITE_KEY = ((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '').trim();
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 60_000;

export const authCaptchaEnabled = () => SITE_KEY.length > 0;

const turnstile = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

let loading: Promise<TurnstileApi | undefined> | null = null;
function loadTurnstile(): Promise<TurnstileApi | undefined> {
  const ready = turnstile();
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = 'true';
      document.head.appendChild(script);
    }
    const done = () => resolve(turnstile());
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', () => { loading = null; resolve(undefined); }, { once: true });
    // the tag may have loaded already (added by another widget)
    window.setTimeout(() => { if (turnstile()) done(); }, 0);
  });
  return loading;
}

export const AUTH_CAPTCHA_ERROR = 'تعذّر التحقق الأمني (أنا لست روبوت). حدّث الصفحة وحاول مرة أخرى.';

/** True when Supabase refused a request for a missing or failed captcha. */
export function isCaptchaError(message?: string | null): boolean {
  return /captcha/i.test(String(message ?? ''));
}

export async function getAuthCaptchaToken(): Promise<string | undefined> {
  if (!SITE_KEY || typeof document === 'undefined') return undefined;
  const api = await loadTurnstile();
  if (!api) return undefined;

  return new Promise((resolve) => {
    // A card at the bottom of the screen that stays hidden unless Cloudflare asks for a click.
    const card = document.createElement('div');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'تحقق أمني');
    card.dir = 'rtl';
    Object.assign(card.style, {
      position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: '2147483000',
      background: '#ffffff', color: '#054180', borderRadius: '16px', padding: '14px 16px 10px',
      boxShadow: '0 12px 40px rgba(5, 65, 128, 0.25)', display: 'none', textAlign: 'center',
      fontSize: '14px', fontWeight: '700', maxWidth: 'calc(100vw - 32px)',
    } as CSSStyleDeclaration);
    const label = document.createElement('p');
    label.textContent = 'تحقق سريع إنك مش روبوت';
    label.style.margin = '0 0 8px';
    const box = document.createElement('div');
    card.append(label, box);
    document.body.appendChild(card);

    let id: string | null = null;
    let settled = false;
    const finish = (token?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try { if (id && api.remove) api.remove(id); } catch { /* already gone */ }
      card.remove();
      resolve(token || undefined);
    };
    const timer = window.setTimeout(() => finish(undefined), TIMEOUT_MS);

    try {
      id = api.render(box, {
        sitekey: SITE_KEY,
        language: 'ar',
        theme: 'light',
        appearance: 'interaction-only',
        callback: (token: string) => finish(token),
        'error-callback': () => finish(undefined),
        'expired-callback': () => finish(undefined),
        'timeout-callback': () => finish(undefined),
        'before-interactive-callback': () => { card.style.display = 'block'; },
        'after-interactive-callback': () => { card.style.display = 'none'; },
      });
    } catch {
      finish(undefined);
    }
  });
}
