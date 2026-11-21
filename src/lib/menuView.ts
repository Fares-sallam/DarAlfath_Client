/**
 * The website's top menu as the header draws it, worked out from the dashboard's «خريطة العرض» (menu rows), the catalog
 * tree and the books the visitor's country can see. Each entry is a link, a heading that only gathers sub-entries, or a
 * series / category / section with its own page; a node with nothing under it and no books is left out (an empty
 * door), and anything switched off is left out with everything inside it.
 */
import type { CatalogNode, ProductLink } from '@/lib/catalogTree';
import { resolveMenu, type MenuItem, type ResolvedMenuItem } from '@/lib/menuMap';
import { nodeHref, orderBooks, productIdsUnder } from '@/lib/nodePage';
import type { ProductItem } from '@/types/store';

export interface MenuView {
  key: string;
  label: string;
  /** Where it goes; null for a heading that only gathers sub-entries. */
  to: string | null;
  /** A link to another site (opened in a new tab). */
  external: boolean;
  kind: ResolvedMenuItem['kind'];
  /** The node's page, when the entry is one (to show its count and «عرض كل كتب …»). */
  nodeId: string | null;
  /** How many books the node holds (0 for the rest). */
  count: number;
  children: MenuView[];
  /** A few of the node's own books, for an entry with nothing below it. */
  preview: ProductItem[];
}

const FIXED_PATHS: Partial<Record<ResolvedMenuItem['kind'], string>> = { home: '/', books: '/books', contact: '/contact' };
const PREVIEW = 5;

/** How many flyouts open one after another from a row: its own sub-menus and, last, a list of books (0 = none). */
export function flyoutDepth(entry: MenuView): number {
  if (entry.children.length > 0) return 1 + Math.max(...entry.children.map(flyoutDepth));
  return entry.preview.length > 0 ? 1 : 0;
}

export function buildMenuView(
  items: readonly MenuItem[],
  nodes: readonly CatalogNode[],
  links: readonly ProductLink[],
  products: readonly ProductItem[],
): MenuView[] {
  if (items.length === 0 || nodes.length === 0) return [];
  const byProduct = new Map<string, ProductItem>();
  for (const product of products) if (!byProduct.has(product.product_id)) byProduct.set(product.product_id, product);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const booksOf = (id: string) => [...productIdsUnder(nodes, links, id)].map((pid) => byProduct.get(pid)).filter((p): p is ProductItem => Boolean(p));

  const build = (entry: ResolvedMenuItem): MenuView | null => {
    if (!entry.visible) return null;
    const children = entry.children.map(build).filter((c): c is MenuView => c !== null);

    if (entry.kind === 'group') {
      return children.length === 0 ? null : {
        key: entry.key, label: entry.label, to: null, external: false, kind: 'group', nodeId: null, count: 0, children, preview: [],
      };
    }
    if (entry.kind === 'node') {
      const node = entry.nodeId ? nodeById.get(entry.nodeId) : undefined;
      if (!node) return null;
      const books = booksOf(node.id);
      if (books.length === 0 && children.length === 0) return null;
      return {
        key: entry.key, label: entry.label, to: nodeHref(node), external: false, kind: 'node', nodeId: node.id, count: books.length,
        children,
        preview: children.length === 0 ? orderBooks(books, node.id, links, node.books_sort_web).slice(0, PREVIEW) : [],
      };
    }
    if (entry.kind === 'link') {
      const url = entry.item?.url?.trim();
      if (!url) return null;
      return {
        key: entry.key, label: entry.label, to: url, external: !url.startsWith('/'), kind: 'link', nodeId: null, count: 0, children, preview: [],
      };
    }
    const to = FIXED_PATHS[entry.kind];
    return to ? { key: entry.key, label: entry.label, to, external: false, kind: entry.kind, nodeId: null, count: 0, children, preview: [] } : null;
  };

  return resolveMenu(items, nodes, 'web').map(build).filter((entry): entry is MenuView => entry !== null);
}
