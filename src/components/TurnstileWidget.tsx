import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove?: (id: string) => void;
};
const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || '';

export interface TurnstileHandle {
  /** A token can be used once: after a send, ask for a new one. */
  reset: () => void;
}

/**
 * Cloudflare's "are you a person" check, when the store has a key for it (VITE_TURNSTILE_SITE_KEY); without
 * one it draws nothing and the form doesn't wait for it. Hands each fresh token to `onToken` ('' when it
 * expires or fails).
 */
const TurnstileWidget = forwardRef<TurnstileHandle, { onToken: (token: string) => void }>(function TurnstileWidget({ onToken }, ref) {
  const box = useRef<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const tokenSink = useRef(onToken);
  tokenSink.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      const t = api();
      if (widget.current && t) t.reset(widget.current);
      tokenSink.current('');
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return undefined;
    let cancelled = false;
    const draw = () => {
      const t = api();
      if (cancelled || !t || !box.current || widget.current) return;
      widget.current = t.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: 'ar',
        theme: 'auto',
        callback: (token: string) => tokenSink.current(token),
        'expired-callback': () => tokenSink.current(''),
        'error-callback': () => tokenSink.current(''),
      });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    if (api()) draw();
    else {
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstileScript = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', draw);
    }
    return () => {
      cancelled = true;
      script?.removeEventListener('load', draw);
      const t = api();
      if (widget.current && t?.remove) t.remove(widget.current);
      widget.current = null;
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="turnstile-box" />;
});

export default TurnstileWidget;
