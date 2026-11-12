const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || '';
type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove?: (id: string) => void;
};

const getApi = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;
let loading: Promise<TurnstileApi | undefined> | null = null;

function loadTurnstile(): Promise<TurnstileApi | undefined> {
  if (getApi()) return Promise.resolve(getApi());
  if (loading) return loading;
  loading = new Promise((resolve) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    let settled = false;
    const finish = (api?: TurnstileApi) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onError);
      if (!api) {
        script?.remove();
        loading = null;
      }
      resolve(api);
    };
    const onLoad = () => finish(getApi());
    const onError = () => finish();
    const timer = window.setTimeout(() => finish(), 10_000);
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.dataset.turnstileScript = 'true';
    }
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!script.isConnected) document.head.appendChild(script);
    window.setTimeout(() => { if (getApi()) finish(getApi()); }, 0);
  });
  return loading;
}

export async function getAuthCaptchaToken(): Promise<string | undefined> {
  if (!SITE_KEY || typeof document === 'undefined') return undefined;
  const api = await loadTurnstile();
  if (!api) return undefined;
  return new Promise((resolve) => {
    const card = document.createElement('div');
    card.dir = 'rtl';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'تحقق أمني');
    Object.assign(card.style, {
      position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
      zIndex: '2147483000', background: 'white', color: '#054180', padding: '14px',
      borderRadius: '8px', boxShadow: '0 8px 30px #0003', display: 'none',
    });
    const box = document.createElement('div');
    card.appendChild(box);
    document.body.appendChild(card);
    let id: string | undefined;
    let settled = false;
    const finish = (token?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (id) api.remove?.(id); } catch { /* widget already removed */ }
      card.remove();
      resolve(token);
    };
    const timer = window.setTimeout(() => finish(), 60_000);
    try {
      id = api.render(box, {
        sitekey: SITE_KEY, language: 'ar', appearance: 'interaction-only',
        callback: (token: string) => finish(token),
        'error-callback': () => finish(),
        'expired-callback': () => finish(),
        'timeout-callback': () => finish(),
        'before-interactive-callback': () => { card.style.display = 'block'; },
        'after-interactive-callback': () => { card.style.display = 'none'; },
      });
    } catch { finish(); }
  });
}
