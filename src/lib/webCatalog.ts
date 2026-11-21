/**
 * What the website lists from the catalog tree, each by the website's own switches and order (the dashboard
 * keeps a separate set for the app): the series cards under the home banner, the category strip under the
 * header, and the categories page. Pure functions over the tree, the book links and the books the visitor's
 * country can see. The tree already leaves out what is switched off or outside its dates (the database
 * hides it), and `useCatalogNodes` drops what is switched off for the website.
 */
import type { CatalogNode, ProductLink } from '@/lib/catalogTree';
import { productIdsUnder } from '@/lib/nodePage';
import type { ProductItem } from '@/types/store';

/** How many of the country's books a node holds (itself and everything below it). */
export function bookCounts(
  nodes: readonly CatalogNode[],
  links: readonly ProductLink[],
  products: readonly ProductItem[],
): Map<string, number> {
  const visible = new Set(products.map((p) => p.product_id));
  const counts = new Map<string, number>();
  for (const node of nodes) {
    let count = 0;
    for (const id of productIdsUnder(nodes, links, node.id)) if (visible.has(id)) count += 1;
    counts.set(node.id, count);
  }
  return counts;
}

const sortWeb = (a: CatalogNode, b: CatalogNode) => a.sort_web - b.sort_web || a.name_ar.localeCompare(b.name_ar, 'ar') || a.id.localeCompare(b.id);

/** The cards of «أقسام المتجر»: the series, in the website's order; an empty one is left out when it is set to hide when empty. */
export function webSeries(nodes: readonly CatalogNode[], counts: ReadonlyMap<string, number>): CatalogNode[] {
  return nodes
    .filter((n) => n.type === 'series' && (!n.hide_when_empty || (counts.get(n.id) ?? 0) > 0))
    .sort(sortWeb);
}

/** The pills of the category strip: categories and collections marked for it, in the website's order, that have books. */
export function webBarCategories(nodes: readonly CatalogNode[], counts: ReadonlyMap<string, number>): CatalogNode[] {
  return nodes
    .filter((n) => (n.type === 'category' || n.type === 'collection') && n.show_in_bar_web && Boolean(n.slug) && (counts.get(n.id) ?? 0) > 0)
    .sort(sortWeb);
}

export interface CategoryGroup {
  /** the series / section the categories sit in (null for the ones that sit in none) */
  parent: CatalogNode | null;
  categories: CatalogNode[];
}

/**
 * The categories page: every category with books, grouped under the series (or section) it sits in, in the website's
 * order; the categories that sit in none come last. A category inside another category is listed under the same series
 * as its parent, after it.
 */
export function categoryGroups(nodes: readonly CatalogNode[], counts: ReadonlyMap<string, number>): CategoryGroup[] {
  const isCategory = (n: CatalogNode) => n.type === 'category' || n.type === 'collection';
  const known = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const withBooks = (n: CatalogNode) => isCategory(n) && (counts.get(n.id) ?? 0) > 0;

  /** the series / section a category belongs to: its nearest ancestor that is not itself a category */
  const holderOf = (node: CatalogNode): CatalogNode | null => {
    const seen = new Set<string>();
    let cursor = node.parent_id && known.has(node.parent_id) ? byId.get(node.parent_id) ?? null : null;
    while (cursor && isCategory(cursor) && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      cursor = cursor.parent_id && known.has(cursor.parent_id) ? byId.get(cursor.parent_id) ?? null : null;
    }
    return cursor && !isCategory(cursor) ? cursor : null;
  };

  /** categories in tree order: a category, then the ones inside it */
  const flatten = (parentId: string | null, into: CatalogNode[]) => {
    // a node whose parent is not shown on the website counts as a top-level one
    const kids = nodes
      .filter((n) => (parentId === null ? !n.parent_id || !known.has(n.parent_id) : n.parent_id === parentId))
      .sort(sortWeb);
    for (const child of kids) {
      if (isCategory(child)) into.push(child);
      flatten(child.id, into);
    }
  };
  const ordered: CatalogNode[] = [];
  flatten(null, ordered);

  const groups = new Map<string | null, CatalogNode[]>();
  for (const category of ordered) {
    if (!withBooks(category)) continue;
    const holder = holderOf(category)?.id ?? null;
    groups.set(holder, [...(groups.get(holder) ?? []), category]);
  }
  const holders = nodes.filter((n) => !isCategory(n) && groups.has(n.id)).sort(sortWeb);
  return [
    ...holders.map((parent) => ({ parent, categories: groups.get(parent.id)! })),
    ...(groups.has(null) ? [{ parent: null, categories: groups.get(null)! }] : []),
  ];
}
