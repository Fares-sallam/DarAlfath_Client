/**
 * The dashboard's live preview of the home page. The dashboard shows the real page in a frame (or a separate window) at
 * `/?preview=home` and sends it the rows it is editing, so a change is seen before it is saved. Read-only: nothing is
 * written, links don't navigate, and the messages are accepted only from the dashboard's own addresses.
 */
import { useSyncExternalStore } from 'react';
import type { HomeLayoutRow } from '@/lib/homeBlocks';

export const PREVIEW_MESSAGE = 'daralfath:home-preview';
export const PREVIEW_READY = 'daralfath:home-preview-ready';

/** The dashboard's address (the website answers only a page that comes from here; development adds the local ones). */
const DASHBOARD_ORIGINS = ['https://dar-alfath-dashboard.vercel.app'];
const DEV_ORIGINS = ['http://127.0.0.1:8080', 'http://localhost:8080'];

export function trustedOrigins(dev: boolean, own: string): string[] {
  return dev ? [...DASHBOARD_ORIGINS, ...DEV_ORIGINS, own] : DASHBOARD_ORIGINS;
}

export function isPreviewMode(search: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  return new URLSearchParams(search).get('preview') === 'home';
}

export interface PreviewState {
  /** the rows to draw instead of the saved ones (null = the saved ones) */
  rows: HomeLayoutRow[] | null;
  /** the time to look at the page «as of» (null = now) */
  now: Date | null;
  /** a country code to look at the page as (null = the visitor's own) */
  country: string | null;
}

const EMPTY: PreviewState = { rows: null, now: null, country: null };
let state: PreviewState = EMPTY;
const listeners = new Set<() => void>();

export const getPreview = () => state;
export function setPreview(next: PreviewState) {
  state = next;
  listeners.forEach((l) => l());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const usePreview = (): PreviewState => useSyncExternalStore(subscribe, getPreview, () => EMPTY);

const str = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.slice(0, max) : null);
const MAX_ROWS = 80;
const MAX_CONFIG_CHARS = 20_000;

/** The rows of a message made safe to draw: only what a row has, with its types, no more than a page could hold. */
export function sanitizeRows(raw: unknown): HomeLayoutRow[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ROWS) return null;
  const rows: HomeLayoutRow[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const section_key = str(r.section_key, 80);
    const kind = str(r.kind, 40);
    if (!section_key || !kind) continue;
    let config: Record<string, unknown> = {};
    if (typeof r.config === 'object' && r.config !== null && !Array.isArray(r.config)) {
      try {
        if (JSON.stringify(r.config).length <= MAX_CONFIG_CHARS) config = r.config as Record<string, unknown>;
      } catch { /* not plain data: ignored */ }
    }
    rows.push({
      section_key, kind,
      node_id: str(r.node_id, 64),
      title_ar: str(r.title_ar, 500),
      subtitle_ar: str(r.subtitle_ar, 500),
      item_limit: typeof r.item_limit === 'number' && Number.isInteger(r.item_limit) ? r.item_limit : null,
      visible: r.visible !== false,
      sort_order: typeof r.sort_order === 'number' && Number.isFinite(r.sort_order) ? r.sort_order : 0,
      starts_at: str(r.starts_at, 40),
      ends_at: str(r.ends_at, 40),
      countries: Array.isArray(r.countries) ? r.countries.filter((c): c is string => typeof c === 'string').slice(0, 12).map((c) => c.slice(0, 2)) : null,
      devices: str(r.devices, 10),
      config,
    });
  }
  return rows;
}

export interface PreviewMessage { rows: HomeLayoutRow[] | null; now: Date | null; country: string | null; scrollTo: string | null }

/** A message from the dashboard, read safely (null when it is not one). */
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== PREVIEW_MESSAGE) return null;
  const d = data as Record<string, unknown>;
  const now = typeof d.now === 'string' && !Number.isNaN(Date.parse(d.now)) ? new Date(d.now) : null;
  const country = typeof d.country === 'string' && /^[A-Za-z]{2}$/.test(d.country) ? d.country.toUpperCase() : null;
  return { rows: sanitizeRows(d.rows), now, country, scrollTo: str(d.scrollTo, 80) };
}

/** Whether a message from `origin` is the dashboard's. */
export const isTrusted = (origin: string, dev: boolean, own: string) => trustedOrigins(dev, own).includes(origin);

/**
 * Starts listening for the dashboard (call once, on the preview page): rows, the date and the country it sends take effect,
 * links don't navigate, and the dashboard is told the page is ready. Returns the cleanup.
 */
export function startPreviewBridge(): () => void {
  const dev = import.meta.env.DEV;
  const own = window.location.origin;

  const scrollTo = (key: string) => {
    const el = document.querySelector(`[data-block-key="${CSS.escape(key)}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  let lastScrolled: string | null = null;
  const onMessage = (event: MessageEvent) => {
    if (!isTrusted(event.origin, dev, own)) return;
    const message = parsePreviewMessage(event.data);
    if (!message) return;
    setPreview({ rows: message.rows, now: message.now, country: message.country });
    if (message.scrollTo && message.scrollTo !== lastScrolled) {
      lastScrolled = message.scrollTo;
      window.setTimeout(() => scrollTo(message.scrollTo as string), 350);
    } else if (!message.scrollTo) {
      lastScrolled = null;
    }
  };
  // links must not take the preview away from the home page
  const onClick = (event: MouseEvent) => {
    if ((event.target as Element | null)?.closest?.('a[href]')) event.preventDefault();
  };
  window.addEventListener('message', onMessage);
  document.addEventListener('click', onClick, true);

  // tell the dashboard (the page that framed or opened this one) that the page is ready, naming only a trusted address
  const parents = [window.parent !== window ? window.parent : null, window.opener as Window | null].filter((w): w is Window => Boolean(w));
  let from = '';
  try { from = document.referrer ? new URL(document.referrer).origin : ''; } catch { from = ''; }
  const targets = isTrusted(from, dev, own) ? [from] : [];
  for (const parent of parents) for (const origin of targets) parent.postMessage({ type: PREVIEW_READY }, origin);

  return () => {
    window.removeEventListener('message', onMessage);
    document.removeEventListener('click', onClick, true);
    setPreview(EMPTY);
  };
}
