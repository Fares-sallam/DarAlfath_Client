/* What a book card, a book's page and the website's footer show, as the dashboard («مظهر المتجر» ← «تفاصيل العرض») sets it
 * and the website and the app read it.
 *
 * This file is shared: the dashboard, the website and the app keep a byte-identical copy (it imports nothing), so a choice
 * made in the dashboard is understood the same way wherever it is drawn. Everything read from the database goes through
 * the whitelists below, so a bad or missing value can only ever fall back to how things were designed, never reach a
 * page as raw markup or a script address. With nothing saved, every default below is exactly what the website and the app
 * showed before this existed.
 */

// ── Channels ─────────────────────────────────────────────────────────────────

export type DisplayChannel = 'web' | 'app';

export const APP_PRIMARY_PRESETS = ['default', 'navy', 'sea'] as const;
export type AppPrimaryPreset = (typeof APP_PRIMARY_PRESETS)[number];
export const APP_PRIMARY_COLORS: Record<Exclude<AppPrimaryPreset, 'default'>, string> = {
  navy: '#054180',
  sea: '#067E70',
};
export const APP_PRIMARY_LABELS: Record<AppPrimaryPreset, string> = {
  default: 'اللون الأصلي',
  navy: 'كحلي الدار',
  sea: 'أخضر بحري',
};
export const appPrimaryColor = (preset: AppPrimaryPreset): string | null =>
  preset === 'default' ? null : APP_PRIMARY_COLORS[preset];

/** One element, switched on or off for each of the two places it can be drawn. */
export interface ChannelSwitch {
  web: boolean;
  app: boolean;
}

const sw = (web: boolean, app: boolean): ChannelSwitch => ({ web, app });

// ── The book card ────────────────────────────────────────────────────────────

export const CARD_ELEMENT_KEYS = ['type', 'category', 'rating', 'editions', 'wishlist', 'share', 'discount', 'isNew', 'lowStock'] as const;
export type CardElement = (typeof CARD_ELEMENT_KEYS)[number];

export interface ElementMeta {
  label: string;
  hint: string;
  /** Where the element exists: a switch for a place it does not exist in is shown disabled and never read. */
  web: boolean;
  app: boolean;
}

export const CARD_ELEMENT_META: Record<CardElement, ElementMeta> = {
  type: { label: 'نوع الكتاب', hint: 'الشارة الصغيرة (كتاب، مجموعة، إلكتروني). في التطبيق بتظهر على الطبعات غير الورقية بس', web: true, app: true },
  category: { label: 'التصنيف', hint: 'اسم التصنيف فوق العنوان (في التطبيق في عرض القائمة)', web: true, app: true },
  rating: { label: 'التقييم بالنجوم', hint: 'النجوم وعدد التقييمات', web: true, app: true },
  editions: { label: 'عدد الطبعات', hint: 'عبارة «عدة خيارات» لما الكتاب له أكتر من طبعة', web: true, app: false },
  wishlist: { label: 'زر المفضلة', hint: 'القلب فوق صورة الكتاب', web: true, app: true },
  share: { label: 'زر المشاركة', hint: 'مشاركة رابط الكتاب', web: true, app: false },
  discount: { label: 'شارة الخصم', hint: 'الشارة اللي بتظهر على الكتب المخفّضة', web: true, app: true },
  isNew: { label: 'شارة «جديد»', hint: 'بتظهر تلقائيًا على الكتب المضافة حديثًا (المدة تحت)', web: true, app: true },
  lowStock: { label: 'شارة «آخر نسخ»', hint: 'بتظهر لما المخزون يقل (الحد تحت)', web: true, app: true },
};

export const CARD_DEFAULT: Record<CardElement, ChannelSwitch> = {
  type: sw(true, true),
  category: sw(true, true),
  rating: sw(true, true),
  editions: sw(true, false),
  wishlist: sw(true, true),
  share: sw(true, false),
  discount: sw(true, true),
  isNew: sw(false, false),
  // the app has always marked a book with 5 copies or fewer; the website never did
  lowStock: sw(false, true),
};

/** How a discount is written on the card: «20%» or «وفّر 30». */
export const DISCOUNT_STYLES = ['percent', 'amount'] as const;
export type DiscountStyle = (typeof DISCOUNT_STYLES)[number];
export const DISCOUNT_STYLE_LABEL: Record<DiscountStyle, string> = { percent: 'نسبة (20%)', amount: 'مبلغ (وفّر 30 ج.م)' };

export const NEW_DAYS_MIN = 1;
export const NEW_DAYS_MAX = 365;
export const NEW_DAYS_DEFAULT = 30;

export const LOW_STOCK_MIN = 1;
export const LOW_STOCK_MAX = 50;
export const LOW_STOCK_DEFAULT = 5;

/** Books per row in the website's books grid (null = as designed: as many as fit). */
export const PER_ROW_DESKTOP = [3, 4, 5, 6] as const;
export const PER_ROW_MOBILE = [1, 2] as const;

// ── The book's page ──────────────────────────────────────────────────────────

export const PAGE_ELEMENT_KEYS = ['publisher', 'pages', 'year', 'category', 'type', 'editions', 'weight', 'language', 'isbn', 'stockHint', 'trust'] as const;
export type PageElement = (typeof PAGE_ELEMENT_KEYS)[number];

export const PAGE_ELEMENT_META: Record<PageElement, ElementMeta> = {
  publisher: { label: 'الناشر', hint: 'صف في المواصفات', web: true, app: true },
  pages: { label: 'عدد الصفحات', hint: 'صف في المواصفات', web: true, app: true },
  year: { label: 'سنة النشر', hint: 'صف في المواصفات', web: true, app: true },
  category: { label: 'التصنيف', hint: 'صف في المواصفات', web: true, app: false },
  type: { label: 'نوع المنتج', hint: 'كتاب أو مجموعة أو إلكتروني', web: true, app: true },
  editions: { label: 'الطبعات', hint: 'الطبعات المتاحة والطبعة المختارة', web: true, app: false },
  weight: { label: 'الوزن', hint: 'وزن الكتاب بالكيلو', web: true, app: true },
  language: { label: 'اللغة', hint: 'صف في المواصفات', web: false, app: true },
  isbn: { label: 'الترقيم الدولي ISBN', hint: 'صف في المواصفات', web: false, app: true },
  stockHint: { label: 'تنبيه «باقي X نسخ»', hint: 'بجوار العنوان لما المخزون يقل (الحد تحت)', web: true, app: true },
  trust: { label: 'شريط الثقة', hint: 'الشارات الصغيرة تحت زر الشراء (تعديلها تحت)', web: true, app: true },
};

export const PAGE_DEFAULT: Record<PageElement, ChannelSwitch> = {
  publisher: sw(true, true),
  pages: sw(true, true),
  year: sw(true, true),
  category: sw(true, false),
  type: sw(true, true),
  editions: sw(true, false),
  weight: sw(true, true),
  language: sw(false, true),
  isbn: sw(false, true),
  // the app has always said «آخر X نسخ» next to the title; the website never did
  stockHint: sw(false, true),
  // the website has always had two badges under the buy button; the app had none
  trust: sw(true, false),
};

/** The icons a trust badge can use. The website and the app each draw their own version of it. */
export const TRUST_ICONS = ['shield', 'truck', 'return', 'cash', 'support', 'gift', 'clock', 'lock', 'check', 'star'] as const;
export type TrustIcon = (typeof TRUST_ICONS)[number];
export const TRUST_ICON_LABEL: Record<TrustIcon, string> = {
  shield: 'درع (أصلي / ضمان)',
  truck: 'شاحنة (شحن)',
  return: 'سهم رجوع (استرجاع)',
  cash: 'نقود (الدفع)',
  support: 'سماعة (دعم)',
  gift: 'هدية',
  clock: 'ساعة (سرعة)',
  lock: 'قفل (أمان)',
  check: 'علامة صح',
  star: 'نجمة',
};

export interface TrustItem {
  icon: TrustIcon;
  text: string;
}

export const TRUST_MAX_ITEMS = 4;
export const TRUST_TEXT_MAX = 40;
export const DEFAULT_TRUST: TrustItem[] = [
  { icon: 'shield', text: 'منتج أصلي' },
  { icon: 'truck', text: 'شحن سريع' },
];

export const DESCRIPTION_MAX = 400;

// ── The footer (website) ─────────────────────────────────────────────────────

export interface FooterLink {
  label: string;
  /** A page inside the store (starts with «/»), a full https address, or mailto: / tel:. */
  url: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export const FOOTER_MAX_COLUMNS = 3;
export const FOOTER_MAX_LINKS = 8;
export const FOOTER_TITLE_MAX = 30;
export const FOOTER_LABEL_MAX = 40;
export const FOOTER_URL_MAX = 300;
export const FOOTER_LINE_MAX = 160;

/** «{year}» in the copyright line is the year it is read in, so it never goes stale. */
export const YEAR_TOKEN = '{year}';

export const DEFAULT_FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'روابط سريعة',
    links: [
      { label: 'الرئيسية', url: '/' },
      { label: 'الكتب', url: '/books' },
      { label: 'سياسة الخصوصية', url: '/policies#privacy' },
      { label: 'الشروط والأحكام', url: '/policies#terms' },
      { label: 'تواصل معنا', url: '/contact' },
    ],
  },
  {
    title: 'خدمة العملاء',
    links: [
      { label: 'تتبع الطلب', url: '/account/orders' },
      { label: 'قائمة المفضلة', url: '/wishlist' },
      { label: 'السلة', url: '/cart' },
      { label: 'حسابي', url: '/account' },
    ],
  },
];

export const DEFAULT_COPYRIGHT = `جميع الحقوق محفوظة © ${YEAR_TOKEN} دار الفتح`;
export const DEFAULT_FOOTER_NOTE = 'صُنع بعناية ليقدم تجربة عربية هادئة وفاخرة.';

export interface FooterSettings {
  /** The link columns between the brand block and the contact block. */
  columns: FooterColumn[];
  showContact: boolean;
  /** The first line of the bottom bar; «{year}» is today's year. */
  copyright: string;
  /** The second line of the bottom bar; empty hides it. */
  note: string;
}

// ── Everything ───────────────────────────────────────────────────────────────

export interface DisplaySettings {
  appPalette: { light: AppPrimaryPreset; dark: AppPrimaryPreset };
  card: {
    show: Record<CardElement, ChannelSwitch>;
    discountStyle: DiscountStyle;
    /** A book is «new» for this many days after it was added. */
    newDays: number;
    /** A book is «low» at this many copies or fewer (the card badge and the page's note). */
    lowStockAt: number;
    /** The website's 3D tilt of a card under the pointer. */
    tilt: boolean;
    perRow: { desktop: number | null; mobile: number | null };
  };
  page: {
    show: Record<PageElement, ChannelSwitch>;
    trust: TrustItem[];
    /** What the description tab says for a book with none; null = the house sentence. */
    description: string | null;
  };
  footer: FooterSettings;
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  appPalette: { light: 'default', dark: 'default' },
  card: {
    show: CARD_DEFAULT,
    discountStyle: 'percent',
    newDays: NEW_DAYS_DEFAULT,
    lowStockAt: LOW_STOCK_DEFAULT,
    tilt: true,
    perRow: { desktop: null, mobile: null },
  },
  page: { show: PAGE_DEFAULT, trust: DEFAULT_TRUST, description: null },
  footer: { columns: DEFAULT_FOOTER_COLUMNS, showContact: true, copyright: DEFAULT_COPYRIGHT, note: DEFAULT_FOOTER_NOTE },
};

export const DISPLAY_COLUMN = 'display';

// ── Reading what was saved ───────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function pickSwitch(raw: unknown, fallback: ChannelSwitch): ChannelSwitch {
  const r = isObject(raw) ? raw : {};
  return { web: typeof r.web === 'boolean' ? r.web : fallback.web, app: typeof r.app === 'boolean' ? r.app : fallback.app };
}

function pickSwitches<K extends string>(keys: readonly K[], defaults: Record<K, ChannelSwitch>, raw: unknown): Record<K, ChannelSwitch> {
  const r = isObject(raw) ? raw : {};
  const out = {} as Record<K, ChannelSwitch>;
  for (const key of keys) out[key] = pickSwitch(r[key], defaults[key]);
  return out;
}

function pickInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function pickFrom<T extends number>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === 'number' && (allowed as readonly number[]).includes(raw) ? (raw as T) : null;
}

/** Text with no markup, no control characters, trimmed and cut to a length. */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A footer link's address, or null when it is not one the footer may link to. */
export function safeFooterUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (url.length === 0 || url.length > FOOTER_URL_MAX || /[\s<>"'`\\]/.test(url)) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (/^https:\/\/[^/?#]+/i.test(url)) return url;
  if (/^mailto:[^@\s]+@[^@\s]+$/i.test(url)) return url;
  if (/^tel:\+?[0-9][0-9\-\s]*$/i.test(url)) return url;
  return null;
}

export type FooterLinkKind = 'internal' | 'external' | 'mail' | 'tel';

export function footerLinkKind(url: string): FooterLinkKind {
  if (url.startsWith('/')) return 'internal';
  if (/^mailto:/i.test(url)) return 'mail';
  if (/^tel:/i.test(url)) return 'tel';
  return 'external';
}

function pickColumns(raw: unknown): FooterColumn[] {
  if (!Array.isArray(raw)) return DEFAULT_FOOTER_COLUMNS;
  const out: FooterColumn[] = [];
  for (const item of raw) {
    if (!isObject(item) || out.length >= FOOTER_MAX_COLUMNS) continue;
    const title = cleanText(item.title, FOOTER_TITLE_MAX);
    const links: FooterLink[] = [];
    if (Array.isArray(item.links)) {
      for (const link of item.links) {
        if (!isObject(link) || links.length >= FOOTER_MAX_LINKS) continue;
        const label = cleanText(link.label, FOOTER_LABEL_MAX);
        const url = safeFooterUrl(link.url);
        if (label && url) links.push({ label, url });
      }
    }
    // a column with neither a title nor a link is nothing
    if (title || links.length > 0) out.push({ title, links });
  }
  return out;
}

function pickTrust(raw: unknown): TrustItem[] {
  if (!Array.isArray(raw)) return DEFAULT_TRUST;
  const out: TrustItem[] = [];
  for (const item of raw) {
    if (!isObject(item) || out.length >= TRUST_MAX_ITEMS) continue;
    const text = cleanText(item.text, TRUST_TEXT_MAX);
    const icon = (TRUST_ICONS as readonly string[]).includes(item.icon as string) ? (item.icon as TrustIcon) : 'check';
    if (text) out.push({ icon, text });
  }
  return out;
}

/** What is saved, made complete and safe: anything missing or odd becomes how things were designed. */
export function resolveDisplay(raw: unknown): DisplaySettings {
  const r = isObject(raw) ? raw : {};
  const appPalette = isObject(r.appPalette) ? r.appPalette : {};
  const card = isObject(r.card) ? r.card : {};
  const page = isObject(r.page) ? r.page : {};
  const footer = isObject(r.footer) ? r.footer : {};
  const perRow = isObject(card.perRow) ? card.perRow : {};
  const description = cleanText(page.description, DESCRIPTION_MAX);

  return {
    appPalette: {
      light: (APP_PRIMARY_PRESETS as readonly string[]).includes(appPalette.light as string) ? appPalette.light as AppPrimaryPreset : 'default',
      dark: (APP_PRIMARY_PRESETS as readonly string[]).includes(appPalette.dark as string) ? appPalette.dark as AppPrimaryPreset : 'default',
    },
    card: {
      show: pickSwitches(CARD_ELEMENT_KEYS, CARD_DEFAULT, card.show),
      discountStyle: (DISCOUNT_STYLES as readonly string[]).includes(card.discountStyle as string) ? (card.discountStyle as DiscountStyle) : 'percent',
      newDays: pickInt(card.newDays, NEW_DAYS_MIN, NEW_DAYS_MAX, NEW_DAYS_DEFAULT),
      lowStockAt: pickInt(card.lowStockAt, LOW_STOCK_MIN, LOW_STOCK_MAX, LOW_STOCK_DEFAULT),
      tilt: card.tilt !== false,
      perRow: { desktop: pickFrom(perRow.desktop, PER_ROW_DESKTOP), mobile: pickFrom(perRow.mobile, PER_ROW_MOBILE) },
    },
    page: {
      show: pickSwitches(PAGE_ELEMENT_KEYS, PAGE_DEFAULT, page.show),
      trust: pickTrust(page.trust),
      description: description || null,
    },
    footer: {
      columns: footer.columns === undefined ? DEFAULT_FOOTER_COLUMNS : pickColumns(footer.columns),
      showContact: footer.showContact !== false,
      copyright: typeof footer.copyright === 'string' ? cleanText(footer.copyright, FOOTER_LINE_MAX) : DEFAULT_COPYRIGHT,
      note: typeof footer.note === 'string' ? cleanText(footer.note, FOOTER_LINE_MAX) : DEFAULT_FOOTER_NOTE,
    },
  };
}

/** The value to save: the same shape, already resolved, so what reaches the database is always clean. */
export function displayToRow(settings: DisplaySettings): { id: 1; display: DisplaySettings } {
  return { id: 1, display: resolveDisplay(settings) };
}

export const isDefaultDisplay = (settings: DisplaySettings): boolean =>
  JSON.stringify(resolveDisplay(settings)) === JSON.stringify(DEFAULT_DISPLAY);

// ── Using it ─────────────────────────────────────────────────────────────────

/** Is an element shown in a place. */
export const shown = (s: ChannelSwitch, channel: DisplayChannel): boolean => s[channel];

/** «New» means added within the last `days` days (and not dated in the future). */
export function isNewBook(createdAt: string | null | undefined, days: number, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const added = Date.parse(createdAt);
  if (!Number.isFinite(added) || added > now) return false;
  return now - added <= days * 86_400_000;
}

/** Low means some copies left, but no more than the limit. Unknown stock (digital, not counted) is never low. */
export function isLowStock(stock: number | null | undefined, limit: number): boolean {
  return typeof stock === 'number' && Number.isFinite(stock) && stock > 0 && stock <= limit;
}

/** The discount badge's words: «20%» or «وفّر 30 ج.م». With no saved amount to show, it falls back to the percentage. */
export function discountText(style: DiscountStyle, percent: number, saved: number | null | undefined, currency: string): string {
  const pct = `${Math.round(percent)}%`;
  if (style !== 'amount' || typeof saved !== 'number' || !Number.isFinite(saved) || saved <= 0) return pct;
  const amount = Number.isInteger(saved) ? String(saved) : saved.toFixed(2).replace(/\.?0+$/, '');
  return `وفّر ${amount}${currency ? ` ${currency}` : ''}`;
}

/** The copyright line with today's year in it. */
export const copyrightText = (template: string, year: number): string => template.split(YEAR_TOKEN).join(String(year));

/** How many link columns plus the contact block the footer draws (the brand block is always first). */
export function footerGrid(footer: FooterSettings): string {
  // the widths the footer was designed with: the brand block wide, the link columns equal, the contact block a hair wider
  return ['2.2fr', ...footer.columns.map(() => '1fr'), ...(footer.showContact ? ['1.05fr'] : [])].join(' ');
}
