/**
 * The dashboard's live previews of «مظهر المتجر»: «تفاصيل العرض» and the look (pattern, strips, button colours). The dashboard shows
 * the real website in a frame (opened with `?preview=display`) and sends it the draft it is editing, so a change is seen on the real
 * cards, the real book page, the real footer and the real buttons before it is saved. Read-only: nothing is written, links that
 * leave the store do nothing, and messages are accepted only from the dashboard's own addresses (the same ones as the home page's
 * preview).
 */
import { useSyncExternalStore } from 'react';
import { resolveAppearance, type StorefrontAppearance } from '@/lib/appearance';
import { resolveDisplay, type DisplaySettings } from '@/lib/displaySettings';
import { isTrusted } from '@/lib/homePreview';

export const DISPLAY_PREVIEW_MESSAGE = 'daralfath:display-preview';
export const DISPLAY_PREVIEW_READY = 'daralfath:display-preview-ready';

/** Is this page the preview one: decided once, from the address it was opened with (the SPA moves on, the preview stays). */
export const isDisplayPreview = (search: string = typeof window === 'undefined' ? '' : window.location.search): boolean =>
  new URLSearchParams(search).get('preview') === 'display';

let state: DisplaySettings | null = null;
let lookState: StorefrontAppearance | null = null;
const listeners = new Set<() => void>();

export const getDisplayPreview = () => state;
export function setDisplayPreview(next: DisplaySettings | null) {
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  listeners.forEach((l) => l());
}
export const getLookPreview = () => lookState;
export function setLookPreview(next: StorefrontAppearance | null) {
  if (JSON.stringify(next) === JSON.stringify(lookState)) return;
  lookState = next;
  listeners.forEach((l) => l());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
/** The draft display settings the dashboard sent, or null (then the saved ones are used). */
export const useDisplayPreview = (): DisplaySettings | null => useSyncExternalStore(subscribe, getDisplayPreview, () => null);
/** The draft look (pattern, strips, button colours) the dashboard sent, or null (then the saved one is used). */
export const useLookPreview = (): StorefrontAppearance | null => useSyncExternalStore(subscribe, getLookPreview, () => null);

/** The pages a preview may be sent to: the home page, the books page, one book, the customers' sign-in page and the cart. */
const NAVIGABLE = /^\/(?:$|books$|account$|cart$|book\/[0-9a-fA-F-]{36}$)/;
export const isPreviewRoute = (value: unknown): value is string => typeof value === 'string' && value.length <= 80 && NAVIGABLE.test(value);

export interface DisplayPreviewMessage {
  /** the draft to draw; null = go back to the saved settings; undefined = the message says nothing about it (keep what is shown) */
  display: DisplaySettings | null | undefined;
  /** the same for the look: pattern strength, the strips, the buttons' colours */
  appearance: StorefrontAppearance | null | undefined;
  /** the day or the night look of the store, to see the colours chosen for each */
  theme: 'light' | 'dark' | null;
  navigate: string | null;
  /** where to scroll to once the page is there: the footer, or the top */
  scroll: 'footer' | 'top' | null;
}

/** A message from the dashboard, read safely (null when it is not one). */
export function parseDisplayPreviewMessage(data: unknown): DisplayPreviewMessage | null {
  if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== DISPLAY_PREVIEW_MESSAGE) return null;
  const d = data as Record<string, unknown>;
  return {
    display: !('display' in d) || d.display === undefined ? undefined : d.display === null ? null : resolveDisplay(d.display),
    appearance: !('appearance' in d) || d.appearance === undefined ? undefined : d.appearance === null ? null : resolveAppearance(d.appearance),
    theme: d.theme === 'dark' ? 'dark' : d.theme === 'light' ? 'light' : null,
    navigate: isPreviewRoute(d.navigate) ? d.navigate : null,
    scroll: d.scroll === 'footer' || d.scroll === 'top' ? d.scroll : null,
  };
}

/**
 * Starts listening for the dashboard (call once, on a preview page): the draft it sends takes effect, links that leave the store
 * do nothing, and the dashboard is told the page is ready. `go` moves the page (the store's own router). Returns the cleanup.
 */
export function startDisplayPreviewBridge(go: (path: string) => void, applyTheme: (theme: 'light' | 'dark') => void = () => {}): () => void {
  const dev = import.meta.env.DEV;
  const own = window.location.origin;
  let lastNavigate = '';
  let lastScroll: string | null = null;

  const onMessage = (event: MessageEvent) => {
    if (!isTrusted(event.origin, dev, own)) return;
    const message = parseDisplayPreviewMessage(event.data);
    if (!message) return;
    if (message.display !== undefined) setDisplayPreview(message.display);
    if (message.appearance !== undefined) setLookPreview(message.appearance);
    if (message.theme) applyTheme(message.theme);
    if (message.navigate && message.navigate !== lastNavigate) {
      lastNavigate = message.navigate;
      go(message.navigate);
    }
    if (message.scroll && message.scroll !== lastScroll) {
      lastScroll = message.scroll;
      window.setTimeout(() => {
        if (message.scroll === 'footer') document.querySelector('.site-footer')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 450);
    } else if (!message.scroll) {
      lastScroll = null;
    }
  };

  // a link that leaves the store (another site, mail, phone, a new tab) must not take the preview away
  const onClick = (event: MouseEvent) => {
    const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const external = a.target === '_blank' || /^(mailto:|tel:)/i.test(a.getAttribute('href') ?? '') || (a.origin !== window.location.origin);
    if (external) event.preventDefault();
  };
  window.addEventListener('message', onMessage);
  document.addEventListener('click', onClick, true);

  // tell the dashboard (the page that framed this one) that the page is ready, naming only a trusted address
  let from = '';
  try { from = document.referrer ? new URL(document.referrer).origin : ''; } catch { from = ''; }
  if (window.parent !== window && isTrusted(from, dev, own)) window.parent.postMessage({ type: DISPLAY_PREVIEW_READY }, from);

  return () => {
    window.removeEventListener('message', onMessage);
    document.removeEventListener('click', onClick, true);
  };
}
