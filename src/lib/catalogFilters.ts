/**
 * Filtering and ordering the books page's list — kept apart from the page so it can be checked
 * on its own. The state lives in the page's address (so a filtered view can be shared and the back
 * button works); this reads it and applies it.
 */
import { matchesSearch, normalizeSearchText } from './search';
import type { ProductItem } from '@/types/store';

export type SortKey = 'title' | 'newest' | 'price-asc' | 'price-desc' | 'discount' | 'rating';

export interface CatalogFilters {
  q: string;
  /** A category slug; also matches a book tagged into it as an extra category. */
  category: string;
  /** A series id. */
  series: string;
  /** An author key (see authorKey): spelling variants of one name are one author. */
  author: string;
  type: string;
  /** Price range in the selected country's currency. A book matches when its cheapest-to-dearest span overlaps
   *  it (the catalog list carries each book's lowest and highest price, not every copy's). */
  min: number | null;
  max: number | null;
  availableOnly: boolean;
  saleOnly: boolean;
  sort: SortKey;
}

export const SORT_LABELS: Record<SortKey, string> = {
  title: 'ترتيب أبجدي',
  newest: 'الأحدث أولًا',
  'price-asc': 'السعر من الأقل',
  'price-desc': 'السعر من الأعلى',
  discount: 'الأعلى خصمًا',
  rating: 'الأعلى تقييمًا',
};

const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];

const number = (value: string | null): number | null => {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(normalizeSearchText(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function parseFilters(params: URLSearchParams): CatalogFilters {
  const sort = params.get('sort') as SortKey | null;
  return {
    q: params.get('q') ?? '',
    category: params.get('category') ?? '',
    series: params.get('series') ?? '',
    author: params.get('author') ?? '',
    type: params.get('type') ?? '',
    min: number(params.get('min')),
    max: number(params.get('max')),
    availableOnly: params.get('available') === '1',
    saleOnly: params.get('sale') === '1',
    sort: sort && SORT_KEYS.includes(sort) ? sort : 'title',
  };
}

/** How many filters (not counting the search words and the order) are on. */
export function activeFilterCount(f: CatalogFilters): number {
  return [f.category, f.series, f.author, f.type].filter(Boolean).length + (f.min != null || f.max != null ? 1 : 0) + (f.availableOnly ? 1 : 0) + (f.saleOnly ? 1 : 0);
}

/* ── authors ───────────────────────────────────────────────────────── */

/** "د / أيمن أمين عبدالغنى" and "أيمن أمين عبدالغني" are one author: same spelling form, no title. */
export function authorKey(author: string): string {
  return normalizeSearchText(author).replace(/^(?:د|dr|prof|أ)\s*[./]?\s*/, '').replace(/\s+/g, ' ').trim();
}

export interface AuthorOption { key: string; label: string; count: number }

/** One entry per author, named the way most of their books spell it, the most prolific first. */
export function authorOptions(products: readonly Pick<ProductItem, 'author'>[]): AuthorOption[] {
  const groups = new Map<string, { spellings: Map<string, number>; count: number }>();
  for (const { author } of products) {
    const name = (author ?? '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = authorKey(name);
    const group = groups.get(key) ?? { spellings: new Map(), count: 0 };
    group.count++;
    group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, { spellings, count }]) => ({
      key,
      count,
      label: [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'))[0][0],
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ar'));
}

/* ── ordering ──────────────────────────────────────────────────────── */

export const newestFirst = <T extends Pick<ProductItem, 'created_at' | 'title'>>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || a.title.localeCompare(b.title, 'ar'));

function sortRows(rows: ProductItem[], sort: SortKey): ProductItem[] {
  switch (sort) {
    case 'newest':
      return newestFirst(rows);
    case 'price-asc':
      return rows.sort((a, b) => a.starting_price - b.starting_price);
    case 'price-desc':
      return rows.sort((a, b) => b.starting_price - a.starting_price);
    case 'discount':
      return rows.sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0) || a.title.localeCompare(b.title, 'ar'));
    case 'rating':
      // A book nobody has rated sorts last, not as a 0-star book.
      return rows.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    default:
      return rows.sort((a, b) => a.title.localeCompare(b.title, 'ar'));
  }
}

/* ── applying ──────────────────────────────────────────────────────── */

export interface FilterContext {
  /** product id → slugs of the extra categories it is tagged into. */
  extraCategorySlugs?: Map<string, Set<string>>;
  /** The member ids of the chosen series (null while they are unknown). */
  seriesProductIds?: ReadonlySet<string> | null;
  /** Ids that can be bought now; null when unknown (the availability filter is then skipped). */
  availableIds?: ReadonlySet<string> | null;
}

export function applyFilters(products: readonly ProductItem[], f: CatalogFilters, ctx: FilterContext = {}): ProductItem[] {
  const author = f.author ? authorKey(f.author) : '';
  const rows = products.filter((p) => {
    if (f.q.trim() && !matchesSearch(p, f.q)) return false;
    if (f.category && p.category_slug !== f.category && !ctx.extraCategorySlugs?.get(p.product_id)?.has(f.category)) return false;
    if (f.series && ctx.seriesProductIds && !ctx.seriesProductIds.has(p.product_id)) return false;
    if (f.type && p.type !== f.type) return false;
    if (author && authorKey(p.author ?? '') !== author) return false;
    if (f.min != null && p.max_price < f.min) return false;
    if (f.max != null && p.min_price > f.max) return false;
    if (f.availableOnly && ctx.availableIds && !ctx.availableIds.has(p.product_id)) return false;
    if (f.saleOnly && !((p.discount_percent ?? 0) > 0)) return false;
    return true;
  });
  return sortRows(rows, f.sort);
}

/** The cheapest and dearest price in the list, whole numbers (for the price fields' hints). */
export function priceBounds(products: readonly Pick<ProductItem, 'min_price' | 'max_price'>[]): { min: number; max: number } | null {
  const prices = products.filter((p) => p.min_price > 0);
  if (prices.length === 0) return null;
  return { min: Math.floor(Math.min(...prices.map((p) => p.min_price))), max: Math.ceil(Math.max(...prices.map((p) => p.max_price))) };
}
