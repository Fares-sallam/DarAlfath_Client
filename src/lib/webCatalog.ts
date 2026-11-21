/**
 * What the website lists from the catalog tree, each by the website's own switches and order (the dashboard
 * keeps a separate set for the app): the series cards under the home banner, the category strip under the
 * header, and the categories page. Pure functions over the tree, the book links and the books the visitor's
 * country can see. The tree already leaves out what is switched off or outside its dates (the database
 * hides it), and `useCatalogNodes` drops what is switched off for the website.
 */
import { newestFirst } from '@/lib/catalogFilters';
import type { CatalogNode, ProductLink } from '@/lib/catalogTree';
import {
  BOOK_SHELF_KIND, FILTER_SHELF_KIND, FILTER_SHELF_DEFAULT_LIMIT, FILTER_SOURCES, PROMO_KIND, bookShelfIds, filterSourceOf, promoOf,
  type HomeBlock, type PromoTone,
} from '@/lib/homeBlocks';
import { webHrefForAppLink } from '@/lib/homeLink';
import { shelvesToShow, type HomeShelf } from '@/lib/homeShelves';
import { nodeHref, orderBooks, productIdsUnder } from '@/lib/nodePage';
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

export interface HomeShelfView {
  key: string;
  title: string;
  subtitle: string;
  /** where «عرض التصنيف» goes */
  href: string;
  books: ProductItem[];
}

/** A shelf's own page: a category by its address name (or by id when it has categories inside it), a series or section by id. */
export function shelfHref(node: CatalogNode, hasChildren: boolean): string {
  if ((node.type === 'category' || node.type === 'collection') && node.slug && !hasChildren) return `/books?category=${encodeURIComponent(node.slug)}`;
  return nodeHref(node).replace('/books?series=', node.type === 'series' ? '/books?series=' : '/books?node=');
}

const SUBTITLE: Record<CatalogNode['type'], string> = {
  category: 'كتب مختارة من هذا التصنيف',
  collection: 'كتب مختارة من هذه المجموعة',
  series: 'كتب من هذه السلسلة',
  section: 'كتب من هذا القسم',
};

/**
 * The home page's chosen category shelves (saved in the dashboard's «الصفحة الرئيسية»): the ones switched on, in their
 * order, each with its own title (or the node's name), the node's books in the order set for the website, cut to the
 * number asked. A shelf with no books for the visitor's country is left out.
 */
export function buildHomeShelves(
  rows: readonly HomeShelf[],
  nodes: readonly CatalogNode[],
  links: readonly ProductLink[],
  products: readonly ProductItem[],
): HomeShelfView[] {
  const byNode = new Map(nodes.map((n) => [n.id, n]));
  const byProduct = new Map<string, ProductItem>();
  for (const product of products) if (!byProduct.has(product.product_id)) byProduct.set(product.product_id, product);

  const views: HomeShelfView[] = [];
  for (const row of shelvesToShow(rows, new Set(byNode.keys()))) {
    const node = byNode.get(row.node_id!)!;
    const own = [...productIdsUnder(nodes, links, node.id)].map((id) => byProduct.get(id)).filter((p): p is ProductItem => Boolean(p));
    if (own.length === 0) continue;
    const ordered = orderBooks(own, node.id, links, node.books_sort_web);
    views.push({
      key: row.section_key,
      title: row.title_ar?.trim() || node.name_ar.trim(),
      subtitle: row.subtitle_ar?.trim() || SUBTITLE[node.type],
      href: shelfHref(node, nodes.some((n) => n.parent_id === node.id)),
      books: row.item_limit != null ? ordered.slice(0, row.item_limit) : ordered,
    });
  }
  return views;
}

/** What an owner-added block draws: a shelf of books (with where «عرض الكل» goes, if anywhere) or a promo strip. */
export type CustomBlockView =
  | { type: 'shelf'; key: string; kind: 'book-shelf' | 'filter-shelf'; title: string; subtitle: string; href: string | null; books: ProductItem[] }
  | { type: 'promo'; key: string; title: string | null; text: string | null; imageUrl: string | null; href: string | null; buttonLabel: string | null; tone: PromoTone };

/** Where «عرض الكل» of a rule shelf goes: the part it is taken from, else the page that lists that rule (none for e-books). */
function ruleHref(source: ReturnType<typeof filterSourceOf>, node: CatalogNode | undefined, nodes: readonly CatalogNode[]): string | null {
  if (node) return shelfHref(node, nodes.some((n) => n.parent_id === node.id));
  if (source === 'newest') return '/books?sort=newest';
  if (source === 'offers') return '/books?sale=1&sort=discount';
  return null;
}

/**
 * The home page's owner-added blocks, by key: hand-picked books (the ones the visitor's country can see, in the chosen order),
 * books by a rule (newest / on offer / e-books, from the whole store or from one node and everything under it) and promo
 * strips. (A list's books carry no copies, so which ones are e-books comes from `digitalIds`.) A shelf with nothing to show has no view (and so is not drawn).
 */
export function buildCustomBlocks(
  blocks: readonly HomeBlock[],
  nodes: readonly CatalogNode[],
  links: readonly ProductLink[],
  products: readonly ProductItem[],
  /** the books that have an e-book copy for the visitor's country (null = not known, so no e-book shelf can be drawn) */
  digitalIds: ReadonlySet<string> | null,
): Map<string, CustomBlockView> {
  const out = new Map<string, CustomBlockView>();
  const byProduct = new Map<string, ProductItem>();
  for (const product of products) if (!byProduct.has(product.product_id)) byProduct.set(product.product_id, product);
  const byNode = new Map(nodes.map((n) => [n.id, n]));

  for (const block of blocks) {
    if (block.kind === BOOK_SHELF_KIND) {
      const books = bookShelfIds(block.config).map((id) => byProduct.get(id)).filter((p): p is ProductItem => Boolean(p));
      if (books.length === 0) continue;
      out.set(block.key, {
        type: 'shelf', key: block.key, kind: BOOK_SHELF_KIND, title: block.title ?? 'كتب مختارة', subtitle: block.subtitle ?? '', href: null,
        books: block.limit != null ? books.slice(0, block.limit) : books,
      });
    } else if (block.kind === FILTER_SHELF_KIND) {
      const source = filterSourceOf(block.config);
      const node = block.nodeId ? byNode.get(block.nodeId) : undefined;
      const pool = node
        ? [...productIdsUnder(nodes, links, node.id)].map((id) => byProduct.get(id)).filter((p): p is ProductItem => Boolean(p))
        : [...byProduct.values()];
      const matching = source === 'offers'
        ? pool.filter((p) => (p.discount_percent ?? 0) > 0).sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0) || a.title.localeCompare(b.title, 'ar'))
        : source === 'ebooks'
          ? newestFirst(pool.filter((p) => digitalIds?.has(p.product_id) === true))
          : newestFirst(pool);
      if (matching.length === 0) continue;
      out.set(block.key, {
        type: 'shelf', key: block.key, kind: FILTER_SHELF_KIND, title: block.title ?? FILTER_SOURCES[source].title,
        subtitle: block.subtitle ?? FILTER_SOURCES[source].subtitle, href: ruleHref(source, node, nodes),
        books: matching.slice(0, block.limit ?? FILTER_SHELF_DEFAULT_LIMIT),
      });
    } else if (block.kind === PROMO_KIND) {
      const promo = promoOf(block.config);
      out.set(block.key, {
        type: 'promo', key: block.key, title: block.title, text: block.subtitle, imageUrl: promo.imageUrl,
        href: webHrefForAppLink(promo.linkUrl, nodes), buttonLabel: promo.buttonLabel, tone: promo.tone,
      });
    }
  }
  return out;
}
