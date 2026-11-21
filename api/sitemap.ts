/**
 * /sitemap.xml — the pages worth indexing: the main pages, every category and series that has books (read from the
 * catalog tree: a hidden or empty one is left out), every book. When the tree can't be read, every category as before.
 */
import { STATIC_SEO, sitemapXml, type SitemapEntry } from '../src/lib/seo';
import { rest, siteOrigin } from './_shared';

interface TreeNode { id: string; parent_id: string | null; type: string; slug: string | null }

/** The pages of the tree worth a place in the sitemap: a category (by its name in the address), a series or section (by id), each with at least one book under it. */
function treePaths(nodes: TreeNode[], links: { product_id: string; node_id: string }[]): string[] {
  const children = new Map<string, string[]>();
  for (const n of nodes) if (n.parent_id) children.set(n.parent_id, [...(children.get(n.parent_id) ?? []), n.id]);
  const booksUnder = (id: string, seen = new Set<string>()): Set<string> => {
    const out = new Set<string>();
    if (seen.has(id)) return out;
    seen.add(id);
    for (const l of links) if (l.node_id === id) out.add(l.product_id);
    for (const child of children.get(id) ?? []) for (const b of booksUnder(child, seen)) out.add(b);
    return out;
  };
  const paths: string[] = [];
  for (const n of nodes) {
    if (booksUnder(n.id).size === 0) continue;
    if ((n.type === 'category' || n.type === 'collection') && n.slug) paths.push(`/store/books?category=${encodeURIComponent(n.slug)}`);
    else if (n.type === 'series') paths.push(`/store/books?series=${encodeURIComponent(n.id)}`);
    else if (n.type === 'section') paths.push(`/store/books?node=${encodeURIComponent(n.id)}`);
  }
  return paths;
}

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const origin = siteOrigin(request);
  const [books, categories, nodes, links] = await Promise.all([
    // One row per book and country: the first of each is enough.
    rest<{ product_id: string; created_at: string | null }>('products_public_catalog?select=product_id,created_at&order=created_at.desc&limit=5000', 6000),
    rest<{ slug: string | null }>('categories?select=slug&limit=1000', 6000),
    // Only what is switched on for the website (the database already hides the inactive and the not-yet-or-no-longer scheduled).
    rest<TreeNode>('catalog_nodes?select=id,parent_id,type,slug&show_web=eq.true&limit=1000', 6000),
    rest<{ product_id: string; node_id: string }>('product_nodes?select=product_id,node_id&limit=10000', 6000),
  ]);
  const fromTree = nodes && nodes.length > 0 && links ? treePaths(nodes, links) : null;

  const seen = new Set<string>();
  const entries: SitemapEntry[] = [
    { path: '/', priority: 1.0 },
    ...(['home', 'books', 'categories', 'contact', 'policies'] as const).map((key) => ({ path: STATIC_SEO[key].path, priority: key === 'home' ? 0.9 : key === 'books' ? 0.8 : 0.5 })),
    ...(fromTree
      ? fromTree.map((path) => ({ path, priority: 0.7 }))
      : (categories ?? [])
          .filter((c): c is { slug: string } => !!c.slug)
          .map((c) => ({ path: `/store/books?category=${encodeURIComponent(c.slug)}`, priority: 0.7 }))),
    ...(books ?? [])
      .filter((b) => (seen.has(b.product_id) ? false : (seen.add(b.product_id), true)))
      .map((b) => ({ path: `/store/book/${b.product_id}`, lastmod: b.created_at, priority: 0.8 })),
  ];

  return new Response(sitemapXml(origin, entries), {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
