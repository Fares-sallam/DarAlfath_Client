/* The storefront's top menu bar: الرئيسية، الكتب، one dropdown per series، تواصل معنا.
   Its order and which items show are saved as site_content_settings.header_nav and read by both
   the store (to draw the bar) and the dashboard (to edit it). Kept identical in both repos. */

export type HeaderNavFixedKey = 'home' | 'books' | 'contact';

export interface HeaderNavEntry {
  /** 'home' | 'books' | 'contact' | `series:<id>` */
  key: string;
  visible: boolean;
}

export const HEADER_NAV_FIXED: Record<HeaderNavFixedKey, { label: string; to: string }> = {
  home: { label: 'الرئيسية', to: '/' },
  books: { label: 'الكتب', to: '/books' },
  contact: { label: 'تواصل معنا', to: '/contact' },
};

export const seriesNavKey = (id: string) => `series:${id}`;

export function seriesIdOf(key: string): string | null {
  return key.startsWith('series:') ? key.slice('series:'.length) : null;
}

function isFixed(key: string): key is HeaderNavFixedKey {
  return key === 'home' || key === 'books' || key === 'contact';
}

/** The default bar: home, books, the series in their own order, contact. */
export function defaultHeaderNav(seriesIds: string[]): HeaderNavEntry[] {
  return [
    { key: 'home', visible: true },
    { key: 'books', visible: true },
    ...seriesIds.map((id) => ({ key: seriesNavKey(id), visible: true })),
    { key: 'contact', visible: true },
  ];
}

/**
 * The bar to draw: the saved order, minus series that no longer exist, plus anything the saved
 * list does not know yet (a series added later goes after the last series in it; a fixed link
 * missing from it goes to its usual place at the start or the end). Nothing saved = the default.
 */
export function resolveHeaderNav(saved: unknown, seriesIds: string[]): HeaderNavEntry[] {
  if (!Array.isArray(saved) || saved.length === 0) return defaultHeaderNav(seriesIds);

  const known = new Set(seriesIds);
  const seen = new Set<string>();
  const list: HeaderNavEntry[] = [];
  for (const raw of saved) {
    const key = typeof raw?.key === 'string' ? raw.key : '';
    if (!key || seen.has(key)) continue;
    const sid = seriesIdOf(key);
    if (!isFixed(key) && !(sid && known.has(sid))) continue;
    seen.add(key);
    list.push({ key, visible: raw?.visible !== false });
  }

  const newSeries = seriesIds.filter((id) => !seen.has(seriesNavKey(id))).map((id) => ({ key: seriesNavKey(id), visible: true }));
  if (newSeries.length) {
    let at = -1;
    list.forEach((e, i) => { if (seriesIdOf(e.key)) at = i; });
    if (at === -1) at = list.findIndex((e) => e.key === 'contact') - 1;
    if (at < -1) at = list.length - 1;
    list.splice(at + 1, 0, ...newSeries);
  }

  if (!seen.has('home')) list.unshift({ key: 'home', visible: true });
  if (!seen.has('books')) list.splice(list[0]?.key === 'home' ? 1 : 0, 0, { key: 'books', visible: true });
  if (!seen.has('contact')) list.push({ key: 'contact', visible: true });
  return list;
}
