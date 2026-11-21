/**
 * What a series / section page shows: its welcome text and video, then one strip of books per node under it
 * (the books under that node and everything below it), then whatever books are left. Pure functions over the
 * catalog tree, the book links and the books the visitor's country can see, so the page stays thin.
 */
import { childrenOf, descendantIds, type BooksSort, type CatalogNode, type ProductLink } from '@/lib/catalogTree';
import { newestFirst } from '@/lib/catalogFilters';
import type { ProductItem } from '@/types/store';

/** The books linked to a node or to anything below it. */
export function productIdsUnder(nodes: readonly CatalogNode[], links: readonly ProductLink[], nodeId: string): Set<string> {
  const scope = descendantIds(nodes, nodeId);
  scope.add(nodeId);
  const out = new Set<string>();
  for (const link of links) if (scope.has(link.node_id)) out.add(link.product_id);
  return out;
}

const byTitle = (a: ProductItem, b: ProductItem) => a.title.localeCompare(b.title, 'ar');

/**
 * A node's books in the order the dashboard chose for the website. «يدوي»: the books linked straight to the node
 * in their saved order, then the ones that come through something below it, alphabetically. «الأكثر مبيعًا» has
 * no sales figures on the website yet, so it follows the manual order.
 */
export function orderBooks(
  books: readonly ProductItem[],
  nodeId: string,
  links: readonly ProductLink[],
  sort: BooksSort,
): ProductItem[] {
  if (sort === 'newest') return newestFirst(books);
  if (sort === 'title') return [...books].sort(byTitle);
  const rank = new Map<string, number>();
  for (const link of links) {
    if (link.node_id === nodeId) rank.set(link.product_id, Math.min(rank.get(link.product_id) ?? Infinity, link.sort_order));
  }
  return [...books].sort((a, b) => (rank.get(a.product_id) ?? Infinity) - (rank.get(b.product_id) ?? Infinity) || byTitle(a, b));
}

export interface NodeStrip {
  node: CatalogNode;
  /** the first `strips_limit` books */
  books: ProductItem[];
  /** how many books the node holds in all */
  total: number;
}

export interface NodePageModel {
  node: CatalogNode;
  /** 'strips': one strip per node under it; 'grid': one list of books (the page has nothing to split into) */
  mode: 'strips' | 'grid';
  strips: NodeStrip[];
  /** books under the node that no strip holds */
  rest: ProductItem[];
  /** every book under the node */
  total: number;
}

export function buildNodePage(
  nodeId: string,
  nodes: readonly CatalogNode[],
  links: readonly ProductLink[],
  products: readonly ProductItem[],
): NodePageModel | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const byId = new Map<string, ProductItem>();
  for (const product of products) if (!byId.has(product.product_id)) byId.set(product.product_id, product);
  const booksOf = (id: string) => [...productIdsUnder(nodes, links, id)].map((pid) => byId.get(pid)).filter((p): p is ProductItem => Boolean(p));

  const all = booksOf(node.id);
  const strips: NodeStrip[] = [];
  const covered = new Set<string>();
  if (node.page_layout !== 'grid') {
    for (const child of childrenOf(nodes, node.id, 'web')) {
      if (!child.show_as_strip) continue;
      const books = booksOf(child.id);
      if (books.length === 0) continue;
      books.forEach((b) => covered.add(b.product_id));
      const ordered = orderBooks(books, child.id, links, child.books_sort_web);
      strips.push({ node: child, books: ordered.slice(0, Math.max(1, node.strips_limit)), total: ordered.length });
    }
  }

  const rest = orderBooks(all.filter((b) => !covered.has(b.product_id)), node.id, links, node.books_sort_web);
  return { node, mode: strips.length > 0 ? 'strips' : 'grid', strips, rest, total: all.length };
}

/** Where a node's own page lives: a series keeps the address it always had. */
export function nodeHref(node: Pick<CatalogNode, 'id' | 'type'>): string {
  return node.type === 'series' ? `/books?series=${node.id}` : `/books?node=${node.id}`;
}
