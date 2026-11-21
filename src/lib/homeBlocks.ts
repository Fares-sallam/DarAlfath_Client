// The blocks of the website's home page, top to bottom, as the dashboard's «الصفحة الرئيسية» lays them out: the seven
// standard blocks and any category shelves, in ONE order, each with show / hide, its own title and line under it, and how
// many books it holds. Saved in home_layout (channel 'web'). Pure helpers, shared by the dashboard and the storefront.
import { HOME_SECTION_KEYS, type HomeSectionKey } from '@/lib/appearance';
import { SHELF_KIND } from '@/lib/homeShelves';

export const PAGE_STRIP_KIND = 'page-strip';
/** The «كتب قد تعجبك» strip on a book's page. */
export const BOOK_RELATED_KEY = 'page:book-related';

export interface BlockDefaults {
  /** the title the website uses when none is written */
  title: string;
  subtitle: string | null;
  /** how many books it holds when none is chosen (null = all of them) */
  limit: number | null;
  /** which of the three can be written in the dashboard */
  editable: ('title' | 'subtitle' | 'limit')[];
  limitLabel?: string;
}

export const BLOCK_DEFAULTS: Record<HomeSectionKey, BlockDefaults> = {
  departments: { title: 'أقسام المتجر', subtitle: null, limit: null, editable: ['title'] },
  'best-sellers': { title: 'الأكثر مبيعًا', subtitle: 'الكتب الأكثر طلبًا من قرّاء الدار', limit: null, editable: ['title', 'subtitle', 'limit'], limitLabel: 'عدد الكتب' },
  'new-arrivals': { title: 'وصل حديثًا', subtitle: 'أحدث إصدارات الدار', limit: 12, editable: ['title', 'subtitle', 'limit'], limitLabel: 'عدد الكتب' },
  offers: { title: 'عروض وخصومات', subtitle: 'كتب بسعر أقل من سعرها المعتاد', limit: null, editable: ['title', 'subtitle', 'limit'], limitLabel: 'عدد الكتب' },
  categories: { title: 'صفوف التصنيفات', subtitle: null, limit: 3, editable: ['limit'], limitLabel: 'عدد الرفوف التلقائية' },
  'intro-videos': { title: 'فيديوهات تعريفية', subtitle: 'مقاطع مختارة من دار الفتح', limit: null, editable: ['title', 'subtitle'] },
  features: { title: 'مربعات المزايا', subtitle: null, limit: null, editable: [] },
};

/** A saved row of home_layout. */
export interface HomeLayoutRow {
  section_key: string;
  kind: string;
  node_id: string | null;
  title_ar: string | null;
  subtitle_ar: string | null;
  item_limit: number | null;
  visible: boolean;
  sort_order: number;
}

export interface HomeBlock {
  /** the row's key: the section's name, or `shelf:<node id>` */
  key: string;
  /** the standard block it is, or null for a category shelf */
  std: HomeSectionKey | null;
  nodeId: string | null;
  title: string | null;
  subtitle: string | null;
  limit: number | null;
  visible: boolean;
  sortOrder: number;
  /** false for a standard block no row exists for yet (it is shown with its defaults) */
  saved: boolean;
}

const isStd = (key: string): key is HomeSectionKey => (HOME_SECTION_KEYS as string[]).includes(key);

/** Whether the saved rows hold a layout the website can follow (at least one standard block). */
export function hasHomeLayout(rows: readonly HomeLayoutRow[]): boolean {
  return rows.some((r) => r.kind === r.section_key && isStd(r.section_key));
}

/**
 * Every block in the order the page draws them: the saved standard blocks and shelves by their numbers; a standard block
 * with no row yet goes at the end (shown, with its defaults) — nothing is ever missing from the list.
 */
export function resolveHomeBlocks(rows: readonly HomeLayoutRow[]): HomeBlock[] {
  const blocks: HomeBlock[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const standard = row.kind === row.section_key && isStd(row.section_key);
    if (!standard && row.kind !== SHELF_KIND) continue;
    if (seen.has(row.section_key)) continue;
    seen.add(row.section_key);
    blocks.push({
      key: row.section_key, std: standard ? (row.section_key as HomeSectionKey) : null, nodeId: row.node_id,
      title: row.title_ar?.trim() || null, subtitle: row.subtitle_ar?.trim() || null, limit: row.item_limit,
      visible: row.visible, sortOrder: row.sort_order, saved: true,
    });
  }
  blocks.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  let next = blocks.length === 0 ? 0 : Math.max(...blocks.map((b) => b.sortOrder)) + 1;
  for (const key of HOME_SECTION_KEYS) {
    if (seen.has(key)) continue;
    blocks.push({ key, std: key, nodeId: null, title: null, subtitle: null, limit: null, visible: true, sortOrder: next++, saved: false });
  }
  return blocks;
}

/** The rows to save for a list of blocks in a new order: each gets its place number. */
export function rowsFor(blocks: readonly HomeBlock[]): HomeLayoutRow[] {
  return blocks.map((b, index) => ({
    section_key: b.key,
    kind: b.std ?? SHELF_KIND,
    node_id: b.nodeId,
    title_ar: b.title,
    subtitle_ar: b.subtitle,
    item_limit: b.limit,
    visible: b.visible,
    sort_order: index,
  }));
}

/** What the website shows for a block's title / line / count: what was written, else the standard one. */
export function blockText(block: Pick<HomeBlock, 'std' | 'title' | 'subtitle' | 'limit'> | undefined, key: HomeSectionKey) {
  const base = BLOCK_DEFAULTS[key];
  return {
    title: block?.title ?? base.title,
    subtitle: block?.subtitle ?? base.subtitle,
    limit: block?.limit ?? base.limit,
  };
}

/** The strip of another page (not a block of the home page): on or off, its title and how many books. */
export interface PageStrip { visible: boolean; title: string | null; limit: number | null }

export function pageStripOf(rows: readonly HomeLayoutRow[], key: string): PageStrip | null {
  const row = rows.find((r) => r.kind === PAGE_STRIP_KIND && r.section_key === key);
  return row ? { visible: row.visible, title: row.title_ar?.trim() || null, limit: row.item_limit } : null;
}
