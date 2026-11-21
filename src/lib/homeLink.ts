/**
 * Where a home-page promo strip's button goes on the website. The dashboard stores ONE link for both channels, in the app's
 * own address format (the same one the app's promo cards use: «/book/…», «/search?series=…»); the website opens the matching
 * page of its own. A link the website has no page for gives null, and the button is simply not drawn there.
 */
import type { CatalogNode } from '@/lib/catalogTree';
import { nodeHref } from '@/lib/nodePage';

/** The app's fixed screens and the website's page for each (the same table as the dashboard's link chooser). */
const FIXED: Record<string, string | null> = {
  '/': '/',
  '/search': '/books',
  '/search?sort=newest': '/books?sort=newest',
  '/ebooks': null,
  '/cart': '/cart',
  '/wishlist': '/wishlist',
  '/orders': '/account/orders',
  '/contact': '/contact',
};

export function webHrefForAppLink(
  link: string | null | undefined,
  nodes: readonly Pick<CatalogNode, 'id' | 'type' | 'name_ar'>[],
): string | null {
  const s = (link ?? '').trim();
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  if (Object.prototype.hasOwnProperty.call(FIXED, s)) return FIXED[s];

  const book = /^\/book\/([^/?#]+)$/.exec(s);
  if (book) return `/book/${book[1]}`;

  if (s.startsWith('/search?')) {
    const params = new URLSearchParams(s.slice('/search?'.length));
    const keys = [...params.keys()];
    const series = params.get('series');
    if (series && keys.every((k) => k === 'series' || k === 'title')) return `/books?series=${encodeURIComponent(series)}`;
    const category = params.get('category');
    if (category && keys.length === 1) {
      const wanted = category.trim();
      const found = nodes.find((n) => (n.type === 'category' || n.type === 'collection') && n.name_ar.trim() === wanted);
      return found ? nodeHref(found) : null;
    }
  }
  return null;
}
