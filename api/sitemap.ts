/** /sitemap.xml — the pages worth indexing: the main pages, every category, every book. */
import { STATIC_SEO, sitemapXml, type SitemapEntry } from '../src/lib/seo';
import { rest, siteOrigin } from './_shared';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const origin = siteOrigin(request);
  const [books, categories] = await Promise.all([
    // One row per book and country: the first of each is enough.
    rest<{ product_id: string; created_at: string | null }>('products_public_catalog?select=product_id,created_at&order=created_at.desc&limit=5000', 6000),
    rest<{ slug: string | null }>('categories?select=slug&limit=1000', 6000),
  ]);

  const seen = new Set<string>();
  const entries: SitemapEntry[] = [
    { path: '/', priority: 1.0 },
    ...(['books', 'categories', 'contact', 'policies'] as const).map((key) => ({ path: STATIC_SEO[key].path, priority: key === 'books' ? 0.9 : 0.5 })),
    ...(categories ?? [])
      .filter((c): c is { slug: string } => !!c.slug)
      .map((c) => ({ path: `/books?category=${encodeURIComponent(c.slug)}`, priority: 0.7 })),
    ...(books ?? [])
      .filter((b) => (seen.has(b.product_id) ? false : (seen.add(b.product_id), true)))
      .map((b) => ({ path: `/book/${b.product_id}`, lastmod: b.created_at, priority: 0.8 })),
  ];

  return new Response(sitemapXml(origin, entries), {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
