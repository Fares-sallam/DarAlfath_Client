// The blocks of the home page (the website's, and the app's), top to bottom, as the dashboard's «الصفحة الرئيسية» lays them
// out: the standard blocks and any category shelves, in ONE order, each with show / hide, its own title and line under it,
// and how many books it holds. Besides the standard blocks and the category shelves there are three kinds of block the
// owner adds: a shelf of hand-picked books, a shelf filtered by a rule (newest / on offer / e-books) and a free promo
// strip. Every block can also be scheduled (from / until), limited to some countries and to phones or computers.
// Saved in home_layout (channel 'web' or 'app'). Pure helpers, shared by the dashboard and the storefront (the app keeps
// its own copy of the same rules, services/homeLayout.ts).
import { HOME_SECTION_KEYS, type HomeSectionKey } from '@/lib/appearance';
import { SHELF_KIND } from '@/lib/homeShelves';

export type HomeChannel = 'web' | 'app';
/** A standard block: the website's seven, and the app's «المكتبة الإلكترونية» card. */
export type HomeBlockKey = HomeSectionKey | 'ebook-library';

/** The standard blocks of each channel, in the order the page had before this was adjustable. */
export const BLOCK_KEYS: Record<HomeChannel, HomeBlockKey[]> = {
  web: HOME_SECTION_KEYS,
  app: ['departments', 'best-sellers', 'new-arrivals', 'offers', 'ebook-library', 'categories', 'intro-videos', 'features'],
};

export const PAGE_STRIP_KIND = 'page-strip';
/** The blocks the owner adds: hand-picked books, books by a rule, a free promo strip (their keys are `block:<id>`). */
export const BOOK_SHELF_KIND = 'book-shelf';
export const FILTER_SHELF_KIND = 'filter-shelf';
export const PROMO_KIND = 'promo';
export const CUSTOM_KINDS: readonly string[] = [BOOK_SHELF_KIND, FILTER_SHELF_KIND, PROMO_KIND];
export type BlockKind = 'standard' | typeof SHELF_KIND | typeof BOOK_SHELF_KIND | typeof FILTER_SHELF_KIND | typeof PROMO_KIND;
/** Most books a hand-picked shelf holds (the database guard says the same). */
export const MAX_PICKED_BOOKS = 40;
export const newBlockKey = (id: string) => `block:${id}`;
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

export const BLOCK_DEFAULTS: Record<HomeBlockKey, BlockDefaults> = {
  departments: { title: 'أقسام المتجر', subtitle: null, limit: null, editable: ['title'] },
  'best-sellers': { title: 'الأكثر مبيعًا', subtitle: 'الكتب الأكثر طلبًا من قرّاء الدار', limit: null, editable: ['title', 'subtitle', 'limit'], limitLabel: 'عدد الكتب' },
  'new-arrivals': { title: 'وصل حديثًا', subtitle: 'أحدث إصدارات الدار', limit: 12, editable: ['title', 'subtitle', 'limit'], limitLabel: 'عدد الكتب' },
  offers: { title: 'عروض وخصومات', subtitle: 'كتب بسعر أقل من سعرها المعتاد', limit: null, editable: ['title', 'subtitle', 'limit'], limitLabel: 'عدد الكتب' },
  categories: { title: 'صفوف التصنيفات', subtitle: null, limit: 3, editable: ['limit'], limitLabel: 'عدد الرفوف التلقائية' },
  'ebook-library': { title: 'المكتبة الإلكترونية', subtitle: 'كتب إلكترونية تقرأها فورًا على جوالك', limit: null, editable: ['title', 'subtitle'] },
  'intro-videos': { title: 'فيديوهات تعريفية', subtitle: 'مقاطع مختارة من دار الفتح', limit: null, editable: ['title', 'subtitle'] },
  features: { title: 'مربعات المزايا', subtitle: null, limit: null, editable: [] },
};

/** What a standard block is called and does, for the dashboard's list. */
export const BLOCK_META: Record<HomeBlockKey, { label: string; hint: string }> = {
  departments: { label: 'السلاسل (الأقسام السريعة)', hint: 'بطاقات السلاسل تحت البانر مباشرة' },
  'best-sellers': { label: 'الأكثر مبيعًا', hint: 'الكتب اللي اخترتها في «إدارة الإعلانات والأشرطة»' },
  'new-arrivals': { label: 'وصل حديثًا', hint: 'أحدث إصدارات الدار' },
  offers: { label: 'عروض وخصومات', hint: 'الكتب المخفّضة، وتظهر لما يبقى عندك 3 منها على الأقل' },
  'ebook-library': { label: 'المكتبة الإلكترونية', hint: 'كارت بيفتح الكتب الإلكترونية، بيظهر لما يبقى فيه كتاب إلكتروني' },
  categories: { label: 'صفوف التصنيفات التلقائية', hint: 'صف لكل تصنيف من أول التصنيفات (بتسكت لما تختار رفوف بنفسك)' },
  'intro-videos': { label: 'فيديوهات «من الدار»', hint: 'المقاطع التعريفية' },
  features: { label: 'مربعات المزايا', hint: 'الشحن والدفع والضمان' },
};

/** The standard text and count of a block in a channel (the app draws four automatic category shelves, the website three). */
export function blockDefaults(key: HomeBlockKey, channel: HomeChannel = 'web'): BlockDefaults {
  const base = BLOCK_DEFAULTS[key];
  return key === 'categories' && channel === 'app' ? { ...base, limit: 4 } : base;
}

export type Devices = 'all' | 'mobile' | 'desktop';

/** When, where and on what a block shows besides being switched on. The app has no countries and always counts as a phone. */
export interface BlockWindow {
  /** ISO time the block starts showing (null = from the start) */
  startsAt: string | null;
  /** ISO time it stops (null = never) */
  endsAt: string | null;
  /** two-letter country codes it shows in (null = every country) */
  countries: string[] | null;
  devices: Devices;
}

export const ALWAYS: BlockWindow = { startsAt: null, endsAt: null, countries: null, devices: 'all' };

/** A saved row of home_layout. The last five fields are optional so rows written before they existed still fit. */
export interface HomeLayoutRow {
  section_key: string;
  kind: string;
  node_id: string | null;
  title_ar: string | null;
  subtitle_ar: string | null;
  item_limit: number | null;
  visible: boolean;
  sort_order: number;
  starts_at?: string | null;
  ends_at?: string | null;
  countries?: string[] | null;
  devices?: string | null;
  config?: Record<string, unknown> | null;
}

export interface HomeBlock {
  /** the row's key: the section's name, `shelf:<node id>` or `block:<id>` */
  key: string;
  /** the standard block it is, or null for any other kind */
  std: HomeBlockKey | null;
  /** what kind of block: a standard one, a category shelf, hand-picked books, books by a rule, or a promo strip */
  kind: BlockKind;
  /** the settings of the owner-added kinds (book ids, the rule, the promo's picture / link / button / tone) */
  config: Record<string, unknown>;
  window: BlockWindow;
  nodeId: string | null;
  title: string | null;
  subtitle: string | null;
  limit: number | null;
  visible: boolean;
  sortOrder: number;
  /** false for a standard block no row exists for yet (it is shown with its defaults) */
  saved: boolean;
}

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const asDevices = (v: unknown): Devices => (v === 'mobile' || v === 'desktop' ? v : 'all');
const asIso = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Date.parse(v)) ? v : null);

/** The window a saved row carries (anything unreadable counts as «always»). */
export function windowOf(row: Pick<HomeLayoutRow, 'starts_at' | 'ends_at' | 'countries' | 'devices'>): BlockWindow {
  const countries = Array.isArray(row.countries)
    ? [...new Set(row.countries.filter((c): c is string => typeof c === 'string').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))]
    : [];
  return { startsAt: asIso(row.starts_at), endsAt: asIso(row.ends_at), countries: countries.length > 0 ? countries : null, devices: asDevices(row.devices) };
}

const isStd = (key: string, channel: HomeChannel = 'web'): key is HomeBlockKey => (BLOCK_KEYS[channel] as string[]).includes(key);

/** Whether the saved rows hold a layout the website can follow (at least one standard block). */
export function hasHomeLayout(rows: readonly HomeLayoutRow[], channel: HomeChannel = 'web'): boolean {
  return rows.some((r) => r.kind === r.section_key && isStd(r.section_key, channel));
}

/**
 * Every block in the order the page draws them: the saved standard blocks and shelves by their numbers; a standard block
 * with no row yet goes at the end (shown, with its defaults) — nothing is ever missing from the list.
 */
export function resolveHomeBlocks(rows: readonly HomeLayoutRow[], channel: HomeChannel = 'web'): HomeBlock[] {
  const blocks: HomeBlock[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const standard = row.kind === row.section_key && isStd(row.section_key, channel);
    if (!standard && row.kind !== SHELF_KIND && !CUSTOM_KINDS.includes(row.kind)) continue;
    if (seen.has(row.section_key)) continue;
    seen.add(row.section_key);
    blocks.push({
      key: row.section_key, std: standard ? (row.section_key as HomeBlockKey) : null,
      kind: standard ? 'standard' : (row.kind as BlockKind), config: isPlain(row.config) ? row.config : {}, window: windowOf(row),
      nodeId: row.node_id,
      title: row.title_ar?.trim() || null, subtitle: row.subtitle_ar?.trim() || null, limit: row.item_limit,
      visible: row.visible, sortOrder: row.sort_order, saved: true,
    });
  }
  blocks.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  let next = blocks.length === 0 ? 0 : Math.max(...blocks.map((b) => b.sortOrder)) + 1;
  for (const key of BLOCK_KEYS[channel]) {
    if (seen.has(key)) continue;
    blocks.push({ key, std: key, kind: 'standard', config: {}, window: ALWAYS, nodeId: null, title: null, subtitle: null, limit: null, visible: true, sortOrder: next++, saved: false });
  }
  return blocks;
}

/** The rows to save for a list of blocks in a new order: each gets its place number. */
export function rowsFor(blocks: readonly HomeBlock[]): HomeLayoutRow[] {
  return blocks.map((b, index) => ({
    section_key: b.key,
    kind: b.std ?? b.kind,
    node_id: b.nodeId,
    title_ar: b.title,
    subtitle_ar: b.subtitle,
    item_limit: b.limit,
    visible: b.visible,
    sort_order: index,
    starts_at: b.window.startsAt,
    ends_at: b.window.endsAt,
    countries: b.window.countries,
    devices: b.window.devices,
    config: b.config,
  }));
}

/** What the website shows for a block's title / line / count: what was written, else the standard one. */
export function blockText(block: Pick<HomeBlock, 'std' | 'title' | 'subtitle' | 'limit'> | undefined, key: HomeBlockKey, channel: HomeChannel = 'web') {
  const base = blockDefaults(key, channel);
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

// ─── When a block shows ───────────────────────────────────────────────────────────────────────────────────────────────

export type HiddenReason = 'switched-off' | 'not-started' | 'ended' | 'country' | 'device';

/** What the page knows about the visitor right now (country and device are null where there is no such thing: the app). */
export interface LiveContext {
  now: Date;
  country: string | null;
  device: 'mobile' | 'desktop' | null;
}

/**
 * Whether a block shows right now, and if not why: switched off, not started yet, ended, not for this country, not for this
 * device. A block limited to some countries is hidden where the country is unknown; a device limit is ignored where the
 * device is unknown.
 */
export function blockStatus(block: Pick<HomeBlock, 'visible' | 'window'>, ctx: LiveContext): { live: boolean; reason: HiddenReason | null } {
  const hide = (reason: HiddenReason) => ({ live: false, reason });
  if (!block.visible) return hide('switched-off');
  const at = ctx.now.getTime();
  const { startsAt, endsAt, countries, devices } = block.window;
  if (startsAt && Date.parse(startsAt) > at) return hide('not-started');
  if (endsAt && Date.parse(endsAt) <= at) return hide('ended');
  if (countries && countries.length > 0 && (!ctx.country || !countries.includes(ctx.country.toUpperCase()))) return hide('country');
  if (devices !== 'all' && ctx.device && ctx.device !== devices) return hide('device');
  return { live: true, reason: null };
}

/** Where a block's dates stand: no dates, not yet, running, over (for the label in the dashboard). */
export function scheduleState(window: Pick<BlockWindow, 'startsAt' | 'endsAt'>, now: Date): 'always' | 'upcoming' | 'running' | 'ended' {
  const { startsAt, endsAt } = window;
  if (!startsAt && !endsAt) return 'always';
  if (startsAt && Date.parse(startsAt) > now.getTime()) return 'upcoming';
  if (endsAt && Date.parse(endsAt) <= now.getTime()) return 'ended';
  return 'running';
}

/** Why a block is hidden, in the owner's words. */
export const HIDDEN_REASON_LABELS: Record<HiddenReason, string> = {
  'switched-off': 'مقفول',
  'not-started': 'لسه ما بدأش',
  ended: 'انتهى',
  country: 'مش لدولة الزائر',
  device: 'مش لجهاز الزائر',
};

// ─── The owner-added kinds ────────────────────────────────────────────────────────────────────────────────────────────

export type FilterSource = 'newest' | 'offers' | 'ebooks';
export const FILTER_SOURCES: Record<FilterSource, { label: string; title: string; subtitle: string }> = {
  newest: { label: 'الأحدث', title: 'وصل حديثًا', subtitle: 'أحدث الإصدارات' },
  offers: { label: 'عروض وخصومات', title: 'عروض وخصومات', subtitle: 'كتب بسعر أقل من سعرها المعتاد' },
  ebooks: { label: 'كتب إلكترونية', title: 'كتب إلكترونية', subtitle: 'تقرأها فورًا على جوالك' },
};
/** How many books a rule shelf holds when no number is chosen. */
export const FILTER_SHELF_DEFAULT_LIMIT = 12;

export type PromoTone = 'light' | 'brand' | 'dark';
export const PROMO_TONES: Record<PromoTone, string> = { light: 'فاتح', brand: 'لون الدار', dark: 'داكن' };

export interface PromoSettings {
  imageUrl: string | null;
  /** a page inside the app (the same link format as the app's promo cards), or null */
  linkUrl: string | null;
  buttonLabel: string | null;
  tone: PromoTone;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The books a hand-picked shelf holds, in the chosen order (only well-formed ids, no repeats, no more than the most). */
export function bookShelfIds(config: Record<string, unknown> | null | undefined): string[] {
  const raw = config?.product_ids;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !UUID.test(id)) continue;
    const lower = id.toLowerCase();
    if (!out.includes(lower)) out.push(lower);
    if (out.length >= MAX_PICKED_BOOKS) break;
  }
  return out;
}

export function filterSourceOf(config: Record<string, unknown> | null | undefined): FilterSource {
  const v = config?.source;
  return v === 'offers' || v === 'ebooks' ? v : 'newest';
}

export function promoOf(config: Record<string, unknown> | null | undefined): PromoSettings {
  const tone = config?.tone;
  return {
    imageUrl: text(config?.image_url),
    linkUrl: text(config?.link_url),
    buttonLabel: text(config?.button_label),
    tone: tone === 'brand' || tone === 'dark' ? tone : 'light',
  };
}

/** The `config` to save for a block of an owner-added kind. */
export function configFor(kind: BlockKind, parts: { productIds?: readonly string[]; source?: FilterSource; promo?: Partial<PromoSettings> }): Record<string, unknown> {
  if (kind === BOOK_SHELF_KIND) return { product_ids: bookShelfIds({ product_ids: parts.productIds ?? [] }) };
  if (kind === FILTER_SHELF_KIND) return { source: parts.source ?? 'newest' };
  if (kind === PROMO_KIND) {
    const p = parts.promo ?? {};
    const out: Record<string, unknown> = { tone: p.tone ?? 'light' };
    if (text(p.imageUrl)) out.image_url = text(p.imageUrl);
    if (text(p.linkUrl)) out.link_url = text(p.linkUrl);
    if (text(p.buttonLabel)) out.button_label = text(p.buttonLabel);
    return out;
  }
  return {};
}

/** Why a block of an owner-added kind can't be saved yet (null = it can). Messages are for the owner. */
export function blockProblem(block: Pick<HomeBlock, 'kind' | 'title' | 'subtitle' | 'config' | 'window' | 'nodeId'>): string | null {
  const { startsAt, endsAt } = block.window;
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return 'تاريخ النهاية لازم يبقى بعد تاريخ البداية.';
  if (block.kind === BOOK_SHELF_KIND && bookShelfIds(block.config).length === 0) return 'اختار كتاب واحد على الأقل.';
  if (block.kind === PROMO_KIND) {
    const promo = promoOf(block.config);
    if (!block.title && !block.subtitle && !promo.imageUrl) return 'اكتب عنوان أو سطر، أو ارفع صورة.';
    if ((block.title ?? '').length > 120) return 'العنوان أطول من 120 حرف.';
    if ((block.subtitle ?? '').length > 400) return 'النص أطول من 400 حرف.';
    if ((promo.buttonLabel ?? '').length > 40) return 'اسم الزر أطول من 40 حرف.';
    if (promo.linkUrl && !(promo.linkUrl.startsWith('/') && !promo.linkUrl.startsWith('//'))) return 'الرابط لازم يكون صفحة جوه التطبيق (يبدأ بـ / ).';
    if (promo.buttonLabel && !promo.linkUrl) return 'الزر من غير وجهة مش هيفتح حاجة. اختار له وجهة.';
  }
  return null;
}

/** What each owner-added kind is called in the dashboard. */
export const CUSTOM_META: Record<typeof BOOK_SHELF_KIND | typeof FILTER_SHELF_KIND | typeof PROMO_KIND, { label: string; hint: string }> = {
  [BOOK_SHELF_KIND]: { label: 'رف كتب مختارة', hint: 'كتب تختارها واحد واحد وترتبها زي ما تحب' },
  [FILTER_SHELF_KIND]: { label: 'رف بقاعدة', hint: 'الأحدث أو العروض أو الكتب الإلكترونية، من المتجر كله أو من تصنيف معين' },
  [PROMO_KIND]: { label: 'شريط إعلان', hint: 'عنوان ونص وصورة وزر، بين الرفوف' },
};

// ─── Copying one channel's layout to the other ────────────────────────────────────────────────────────────────────────

/**
 * The rows that make the TARGET channel's home page follow the SOURCE's: the same blocks in the same order with the same
 * titles, counts, dates and settings; blocks the target has no such thing as are left out (the website has no e-book card),
 * and blocks only the target has keep their own settings and go to the end. `remove` lists the target's saved blocks that
 * are no longer in the list (delete them in the same request). Countries and devices don't carry over to the app (it has
 * none), and the other pages' strips are never touched.
 */
export function copyLayout(
  source: readonly HomeLayoutRow[],
  target: readonly HomeLayoutRow[],
  from: HomeChannel,
  to: HomeChannel,
): { rows: HomeLayoutRow[]; remove: string[] } {
  const keep = new Set<string>(BLOCK_KEYS[to]);
  const fromBlocks = resolveHomeBlocks(source, from).filter((b) => b.std === null || keep.has(b.std));
  const copied: HomeBlock[] = fromBlocks.map((b) => ({
    ...b,
    window: { ...b.window, countries: to === 'app' ? null : b.window.countries, devices: 'all' },
    saved: true,
  }));
  const taken = new Set(copied.map((b) => b.key));
  const targetBlocks = resolveHomeBlocks(target, to);
  const rest = targetBlocks.filter((b) => b.std !== null && !taken.has(b.key));
  const next = [...copied, ...rest];
  const nextKeys = new Set(next.map((b) => b.key));
  const remove = targetBlocks.filter((b) => b.saved && !nextKeys.has(b.key)).map((b) => b.key);
  return { rows: rowsFor(next), remove };
}
