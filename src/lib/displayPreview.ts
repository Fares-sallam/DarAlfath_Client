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
import type { CatalogNode, PageLayout } from '@/lib/catalogTree';

export const DISPLAY_PREVIEW_MESSAGE = 'daralfath:display-preview';
export const DISPLAY_PREVIEW_READY = 'daralfath:display-preview-ready';

/** Is this page the preview one: decided once, from the address it was opened with (the SPA moves on, the preview stays). */
export const isDisplayPreview = (search: string = typeof window === 'undefined' ? '' : window.location.search): boolean =>
  new URLSearchParams(search).get('preview') === 'display';

/** The «أقسام المتجر» cards being edited in the dashboard: which nodes, in what order, and the pictures chosen for them. */
export interface DepartmentsDraft {
  ids: string[];
  /** a picture chosen for a node (null = none), instead of the node's saved one */
  images: Record<string, string | null>;
}

/** The look of one node's own page being edited in the dashboard: only the fields it sends are replaced. */
export interface NodePageDraft {
  id: string;
  fields: Partial<Pick<CatalogNode,
    'intro_ar' | 'intro_en' | 'video_url' | 'intro_media' | 'intro_image_url' | 'intro_align' | 'intro_font_px' | 'intro_pad_right' | 'intro_pad_left' | 'intro_text_pos' | 'page_layout' | 'strips_limit'
  >>;
}

let state: DisplaySettings | null = null;
let lookState: StorefrontAppearance | null = null;
let departmentsState: DepartmentsDraft | null = null;
let nodePageState: NodePageDraft | null = null;
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
export const getDepartmentsPreview = () => departmentsState;
export function setDepartmentsPreview(next: DepartmentsDraft | null) {
  if (JSON.stringify(next) === JSON.stringify(departmentsState)) return;
  departmentsState = next;
  listeners.forEach((l) => l());
}
export const getNodePagePreview = () => nodePageState;
export function setNodePagePreview(next: NodePageDraft | null) {
  if (JSON.stringify(next) === JSON.stringify(nodePageState)) return;
  nodePageState = next;
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

/** The «أقسام المتجر» draft the dashboard sent, or null (then the saved cards are used). */
export const useDepartmentsPreview = (): DepartmentsDraft | null => useSyncExternalStore(subscribe, getDepartmentsPreview, () => null);
/** The draft of this node's page the dashboard sent (only the fields it changes), or null. */
export const useNodePagePreview = (nodeId: string | null | undefined): NodePageDraft['fields'] | null =>
  useSyncExternalStore(subscribe, () => (nodeId && nodePageState?.id === nodeId ? nodePageState.fields : null), () => null);

/** The pages a preview may be sent to: the home page, the books page (or one series / section / category page of it), one book, the sign-in page and the cart. */
const NAVIGABLE = /^\/(?:$|books(?:\?(?:series|node)=[0-9a-fA-F-]{36})?$|account$|cart$|book\/[0-9a-fA-F-]{36}$)/;
export const isPreviewRoute = (value: unknown): value is string => typeof value === 'string' && value.length <= 80 && NAVIGABLE.test(value);

const UUID = /^[0-9a-fA-F-]{36}$/;
const httpsAddress = (value: unknown): string | null => (typeof value === 'string' && /^https:\/\/\S{1,500}$/.test(value.trim()) ? value.trim() : null);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined => (allowed.includes(value as T) ? (value as T) : undefined);
const whole = (value: unknown, min: number, max: number): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
};

/** The «أقسام المتجر» draft, read safely: node ids and https picture addresses only (null when it is not one). */
export function parseDepartmentsDraft(raw: unknown): DepartmentsDraft | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.ids)) return null;
  const ids = d.ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)).slice(0, 60);
  const images: Record<string, string | null> = {};
  if (typeof d.images === 'object' && d.images !== null) {
    for (const [id, value] of Object.entries(d.images as Record<string, unknown>).slice(0, 60)) {
      if (UUID.test(id)) images[id] = httpsAddress(value);
    }
  }
  return { ids, images };
}

/** One node page's draft, read safely: every field held to what the page can draw (null when it is not one). */
export function parseNodePageDraft(raw: unknown): NodePageDraft | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== 'string' || !UUID.test(d.id) || typeof d.fields !== 'object' || d.fields === null) return null;
  const f = d.fields as Record<string, unknown>;
  const fields: NodePageDraft['fields'] = {};
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.slice(0, 4000) : null);
  if ('intro_ar' in f) fields.intro_ar = text(f.intro_ar);
  if ('intro_en' in f) fields.intro_en = text(f.intro_en);
  if ('video_url' in f) fields.video_url = httpsAddress(f.video_url);
  if ('intro_image_url' in f) fields.intro_image_url = httpsAddress(f.intro_image_url);
  const media = oneOf(f.intro_media, ['auto', 'video', 'image', 'none'] as const);
  if (media) fields.intro_media = media;
  const align = oneOf(f.intro_align, ['right', 'center', 'left'] as const);
  if (align) fields.intro_align = align;
  const pos = oneOf(f.intro_text_pos, ['side', 'above', 'below'] as const);
  if (pos) fields.intro_text_pos = pos;
  const layout = oneOf<PageLayout>(f.page_layout, ['auto', 'strips', 'grid']);
  if (layout) fields.page_layout = layout;
  const size = whole(f.intro_font_px, 12, 40);
  if (size !== undefined) fields.intro_font_px = size;
  const right = whole(f.intro_pad_right, 0, 240);
  if (right !== undefined) fields.intro_pad_right = right;
  const left = whole(f.intro_pad_left, 0, 240);
  if (left !== undefined) fields.intro_pad_left = left;
  const limit = whole(f.strips_limit, 1, 60);
  if (limit !== undefined) fields.strips_limit = limit;
  return { id: d.id, fields };
}

export interface DisplayPreviewMessage {
  /** the draft to draw; null = go back to the saved settings; undefined = the message says nothing about it (keep what is shown) */
  display: DisplaySettings | null | undefined;
  /** the same for the look: pattern strength, the strips, the buttons' colours */
  appearance: StorefrontAppearance | null | undefined;
  /** the day or the night look of the store, to see the colours chosen for each */
  theme: 'light' | 'dark' | null;
  /** the «أقسام المتجر» cards being edited (null = back to the saved ones; undefined = keep what is shown) */
  departments: DepartmentsDraft | null | undefined;
  /** one node page being edited (null = back to the saved one; undefined = keep what is shown) */
  nodePage: NodePageDraft | null | undefined;
  navigate: string | null;
  /** where to scroll to once the page is there: the footer, the «أقسام المتجر» cards, or the top */
  scroll: 'footer' | 'top' | 'departments' | null;
}

/** A message from the dashboard, read safely (null when it is not one). */
export function parseDisplayPreviewMessage(data: unknown): DisplayPreviewMessage | null {
  if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== DISPLAY_PREVIEW_MESSAGE) return null;
  const d = data as Record<string, unknown>;
  return {
    display: !('display' in d) || d.display === undefined ? undefined : d.display === null ? null : resolveDisplay(d.display),
    appearance: !('appearance' in d) || d.appearance === undefined ? undefined : d.appearance === null ? null : resolveAppearance(d.appearance),
    theme: d.theme === 'dark' ? 'dark' : d.theme === 'light' ? 'light' : null,
    departments: !('departments' in d) || d.departments === undefined ? undefined : d.departments === null ? null : parseDepartmentsDraft(d.departments),
    nodePage: !('nodePage' in d) || d.nodePage === undefined ? undefined : d.nodePage === null ? null : parseNodePageDraft(d.nodePage),
    navigate: isPreviewRoute(d.navigate) ? d.navigate : null,
    scroll: d.scroll === 'footer' || d.scroll === 'top' || d.scroll === 'departments' ? d.scroll : null,
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
    if (message.departments !== undefined) setDepartmentsPreview(message.departments);
    if (message.nodePage !== undefined) setNodePagePreview(message.nodePage);
    if (message.theme) applyTheme(message.theme);
    if (message.navigate && message.navigate !== lastNavigate) {
      lastNavigate = message.navigate;
      go(message.navigate);
    }
    if (message.scroll && message.scroll !== lastScroll) {
      lastScroll = message.scroll;
      window.setTimeout(() => {
        if (message.scroll === 'footer') document.querySelector('.site-footer')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        else if (message.scroll === 'departments') document.querySelector('.store-departments')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
