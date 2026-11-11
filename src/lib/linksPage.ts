/* The company links page (/links): its blocks, how each one is described, and the rules for what a
   link may point at. Saved as links_page_settings / links_page_blocks, drawn by the store
   (pages/LinksPage) and by the dashboard's live preview (إدارة الصفحة والروابط).
   Kept identical in both repos. */

/* ── What a block can be, and the choices each one offers ─────────────────────────────────── */

export const BLOCK_KINDS = ['link', 'offer', 'image', 'heading', 'text', 'divider'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_KIND_LABEL: Record<BlockKind, string> = {
  link: 'رابط',
  offer: 'عرض',
  image: 'صورة',
  heading: 'عنوان',
  text: 'نص',
  divider: 'فاصل',
};

/** Colours come from the house palette only. `primary` follows the theme: navy by day, sea green by night. */
export const COLOR_STYLES = ['primary', 'navy', 'teal', 'green', 'mint', 'outline'] as const;
export type ColorStyle = (typeof COLOR_STYLES)[number];
export const COLOR_STYLE_LABEL: Record<ColorStyle, string> = {
  primary: 'الأساسي (يتغيّر مع الثيم)',
  navy: 'كحلي',
  teal: 'تركوازي',
  green: 'أخضر بحري',
  mint: 'نعناعي فاتح',
  outline: 'إطار فقط',
};

export const DISPLAYS = ['button', 'icon'] as const;
export type LinkDisplay = (typeof DISPLAYS)[number];

export const DIVIDER_TYPES = ['pattern', 'line', 'dashed', 'dotted', 'double', 'ornament', 'band', 'space'] as const;
export type DividerType = (typeof DIVIDER_TYPES)[number];
export const DIVIDER_TYPE_LABEL: Record<DividerType, string> = {
  pattern: 'باترن الهوية',
  line: 'خط رفيع',
  dashed: 'خط متقطع',
  dotted: 'نقاط',
  double: 'خط مزدوج',
  ornament: 'زخرفة صغيرة',
  band: 'شريط الباترن',
  space: 'مسافة فارغة',
};

export const DIVIDER_LENGTHS = ['short', 'medium', 'long'] as const;
export type DividerLength = (typeof DIVIDER_LENGTHS)[number];
export const DIVIDER_LENGTH_LABEL: Record<DividerLength, string> = { short: 'قصير', medium: 'متوسط', long: 'طويل' };

export const ALIGNS = ['start', 'center', 'end', 'justify'] as const;
export type Align = (typeof ALIGNS)[number];
export const ALIGN_LABEL: Record<Align, string> = { start: 'يمين', center: 'وسط', end: 'يسار', justify: 'ضبط' };

export const SIZES = ['sm', 'md', 'lg'] as const;
export type Size = (typeof SIZES)[number];
export const SIZE_LABEL: Record<Size, string> = { sm: 'صغير', md: 'متوسط', lg: 'كبير' };

export const BUTTON_SHAPES = ['rounded', 'pill', 'square'] as const;
export type ButtonShape = (typeof BUTTON_SHAPES)[number];
export const BUTTON_SHAPE_LABEL: Record<ButtonShape, string> = { rounded: 'حواف مدوّرة', pill: 'كبسولة', square: 'حواف حادة' };

export const PAGE_BACKGROUNDS = ['pattern', 'plain'] as const;
export type PageBackground = (typeof PAGE_BACKGROUNDS)[number];
export const PAGE_BACKGROUND_LABEL: Record<PageBackground, string> = { pattern: 'باترن الهوية خفيف', plain: 'سادة' };

/** The icons a link can wear. The store and the dashboard draw them from the same keys (components/links/linkIcons). */
export const ICON_OPTIONS: { key: string; label: string }[] = [
  { key: 'facebook', label: 'فيسبوك' },
  { key: 'instagram', label: 'إنستجرام' },
  { key: 'whatsapp', label: 'واتساب' },
  { key: 'youtube', label: 'يوتيوب' },
  { key: 'tiktok', label: 'تيك توك' },
  { key: 'telegram', label: 'تيليجرام' },
  { key: 'x', label: 'X (تويتر)' },
  { key: 'linkedin', label: 'لينكدإن' },
  { key: 'website', label: 'موقع إلكتروني' },
  { key: 'email', label: 'بريد إلكتروني' },
  { key: 'phone', label: 'اتصال' },
  { key: 'location', label: 'الموقع على الخريطة' },
  { key: 'store', label: 'المتجر' },
  { key: 'books', label: 'كتب' },
  { key: 'library', label: 'مكتبة' },
  { key: 'app', label: 'التطبيق' },
  { key: 'apple', label: 'App Store' },
  { key: 'googleplay', label: 'Google Play' },
  { key: 'download', label: 'تحميل' },
  { key: 'offer', label: 'عرض' },
  { key: 'gift', label: 'هدية' },
  { key: 'percent', label: 'خصم' },
  { key: 'star', label: 'نجمة' },
  { key: 'sparkles', label: 'جديد' },
  { key: 'heart', label: 'قلب' },
  { key: 'megaphone', label: 'إعلان' },
  { key: 'calendar', label: 'موعد' },
  { key: 'truck', label: 'شحن' },
  { key: 'graduation', label: 'تعليم' },
  { key: 'link', label: 'رابط عام' },
];

/* ── The saved shapes ─────────────────────────────────────────────────────────────────────── */

export interface LinksPageSettings {
  is_enabled: boolean;
  /** The visible heading under the logo; empty draws none (the page still has a hidden one for screen readers). */
  title: string;
  tagline: string;
  show_logo: boolean;
  button_shape: ButtonShape;
  background: PageBackground;
  footer_text: string;
  seo_title: string;
  seo_description: string;
  share_image_url: string | null;
}

export const DEFAULT_LINKS_SETTINGS: LinksPageSettings = {
  is_enabled: true,
  title: '',
  tagline: '',
  show_logo: true,
  button_shape: 'rounded',
  background: 'pattern',
  footer_text: '',
  seo_title: '',
  seo_description: '',
  share_image_url: null,
};

export interface LinksBlock {
  id: string;
  kind: BlockKind;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  title: string;
  body: string;
  url: string | null;
  cta_label: string | null;
  image_url: string | null;
  icon: string | null;
  badge: string | null;
  coupon_code: string | null;
  /** Whatever the dashboard saved; read through resolveLook, never directly. */
  look: Record<string, unknown>;
}

export const BLOCK_COLUMNS =
  'id, kind, sort_order, is_active, starts_at, ends_at, title, body, url, cta_label, image_url, icon, badge, coupon_code, look';
export const SETTINGS_COLUMNS =
  'is_enabled, title, tagline, show_logo, button_shape, background, footer_text, seo_title, seo_description, share_image_url';

/* ── Reading what was saved (a bad value falls back, it never breaks the page) ────────────── */

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
const textOrNull = (value: unknown, max: number): string | null => {
  const v = text(value, max).trim();
  return v === '' ? null : v;
};

export function resolveSettings(raw: unknown): LinksPageSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LINKS_SETTINGS;
  return {
    is_enabled: typeof r.is_enabled === 'boolean' ? r.is_enabled : d.is_enabled,
    title: text(r.title, 120),
    tagline: text(r.tagline, 300),
    show_logo: typeof r.show_logo === 'boolean' ? r.show_logo : d.show_logo,
    button_shape: pick(r.button_shape, BUTTON_SHAPES, d.button_shape),
    background: pick(r.background, PAGE_BACKGROUNDS, d.background),
    footer_text: text(r.footer_text, 300),
    seo_title: text(r.seo_title, 120),
    seo_description: text(r.seo_description, 300),
    share_image_url: textOrNull(r.share_image_url, 2000),
  };
}

export function resolveBlock(raw: unknown): LinksBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = pick(r.kind, BLOCK_KINDS, 'link');
  if (typeof r.id !== 'string' || !r.id) return null;
  return {
    id: r.id,
    kind,
    sort_order: typeof r.sort_order === 'number' ? r.sort_order : 0,
    is_active: r.is_active !== false,
    starts_at: typeof r.starts_at === 'string' ? r.starts_at : null,
    ends_at: typeof r.ends_at === 'string' ? r.ends_at : null,
    title: text(r.title, 160),
    body: text(r.body, 1500),
    url: textOrNull(r.url, 2000),
    cta_label: textOrNull(r.cta_label, 40),
    image_url: textOrNull(r.image_url, 2000),
    icon: textOrNull(r.icon, 30),
    badge: textOrNull(r.badge, 30),
    coupon_code: textOrNull(r.coupon_code, 40),
    look: r.look && typeof r.look === 'object' && !Array.isArray(r.look) ? (r.look as Record<string, unknown>) : {},
  };
}

export const sortBlocks = (blocks: LinksBlock[]): LinksBlock[] => [...blocks].sort((a, b) => a.sort_order - b.sort_order);

/** How a block looks, every choice resolved to something the page knows how to draw. */
export interface ResolvedLook {
  style: ColorStyle;
  display: LinkDisplay;
  /** null: automatic (a link to another site opens in a new tab, one inside the store does not). */
  newTab: boolean | null;
  align: Align;
  size: Size;
  dividerType: DividerType;
  dividerLength: DividerLength;
  /** An offer: print "ينتهي يوم …" from its end date. */
  showEnd: boolean;
  /** An image: print its description under it. */
  showCaption: boolean;
}

export function resolveLook(kind: BlockKind, raw: unknown): ResolvedLook {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const alignAllowed: readonly Align[] = kind === 'text' ? ['start', 'center', 'justify'] : ['start', 'center', 'end'];
  return {
    style: pick(r.style, COLOR_STYLES, 'primary'),
    display: kind === 'link' ? pick(r.display, DISPLAYS, 'button') : 'button',
    newTab: typeof r.newTab === 'boolean' ? r.newTab : null,
    align: pick(r.align, alignAllowed, 'center'),
    size: pick(r.size, SIZES, 'md'),
    dividerType: pick(r.type, DIVIDER_TYPES, 'pattern'),
    dividerLength: pick(r.length, DIVIDER_LENGTHS, 'medium'),
    showEnd: r.showEnd === true,
    showCaption: r.showCaption === true,
  };
}

/** The look worth saving for a block: only the choices its kind has, so a block never carries stale ones. */
export function cleanLook(kind: BlockKind, raw: unknown): Record<string, unknown> {
  const l = resolveLook(kind, raw);
  switch (kind) {
    case 'link': return { style: l.style, display: l.display, ...(l.newTab === null ? {} : { newTab: l.newTab }) };
    case 'offer': return { style: l.style, showEnd: l.showEnd, ...(l.newTab === null ? {} : { newTab: l.newTab }) };
    case 'image': return { showCaption: l.showCaption, ...(l.newTab === null ? {} : { newTab: l.newTab }) };
    case 'heading': return { align: l.align, size: l.size };
    case 'text': return { align: l.align, size: l.size };
    case 'divider': return { type: l.dividerType, length: l.dividerLength };
  }
}

/* ── Where a link may point ───────────────────────────────────────────────────────────────── */

/** Latin text inside an Arabic sentence, kept in its own direction (otherwise "https://" is drawn as "//:https"). */
export const ltr = (text: string): string => `\u2066${text}\u2069`;

/** What an address may start with, as a sentence for the dashboard. */
export const URL_RULE = `ابدأه بـ ${ltr('https://')} لموقع خارجي، أو ${ltr('/')} لصفحة جوه المتجر (مثال: ${ltr('/books')})، أو ${ltr('mailto:')} أو ${ltr('tel:')} للإيميل والاتصال.`;

export type UrlKind = 'internal' | 'external' | 'mail' | 'tel' | 'anchor';

/** A control character (NUL and DEL included) or a backslash: never part of an address the page will draw. */
function hasUnsafeCharacter(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/**
 * A link the page is willing to draw, or null. Only https/http, mailto:, tel:, #anchors and paths
 * inside the store are allowed: nothing like javascript: or data:, no //host and no backslashes
 * (a browser reads "/\host" as "//host"). The database refuses the same set, so this is the second lock.
 */
export function classifyUrl(raw: string | null | undefined): { href: string; kind: UrlKind } | null {
  const s = (raw ?? '').trim();
  if (!s || s.length > 2000) return null;
  if (/\s/.test(s) || hasUnsafeCharacter(s)) return null;

  if (s.startsWith('#')) return { href: s, kind: 'anchor' };
  if (s.startsWith('/')) return s.startsWith('//') ? null : { href: s, kind: 'internal' };
  if (/^mailto:/i.test(s)) return /^mailto:[^\s@?]+@[^\s@?]+\.[^\s@?]+(\?.*)?$/i.test(s) ? { href: s, kind: 'mail' } : null;
  if (/^tel:/i.test(s)) return /^tel:\+?[0-9()-]{3,30}$/i.test(s) ? { href: s, kind: 'tel' } : null;
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname ? { href: s, kind: 'external' } : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** What an admin typed, made into a link where that is obvious: a bare address gets https://. */
export function normalizeUrlInput(input: string): string {
  const s = input.trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('/') || s.startsWith('#')) return s;
  if (/^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+(\/\S*)?$/u.test(s)) return `https://${s}`;
  return s;
}

/** A picture must be on https; the dashboard uploads to the store's own storage, a pasted one may be anywhere. */
export const isImageUrl = (value: string | null | undefined): boolean => /^https:\/\/[^\s\\]+$/i.test((value ?? '').trim());

/* ── When a block shows ───────────────────────────────────────────────────────────────────── */

export type BlockStatus = 'live' | 'hidden' | 'scheduled' | 'ended';

export function blockStatus(b: Pick<LinksBlock, 'is_active' | 'starts_at' | 'ends_at'>, now: Date = new Date()): BlockStatus {
  if (!b.is_active) return 'hidden';
  if (b.starts_at && new Date(b.starts_at) > now) return 'scheduled';
  if (b.ends_at && new Date(b.ends_at) <= now) return 'ended';
  return 'live';
}

export const isLive = (b: Pick<LinksBlock, 'is_active' | 'starts_at' | 'ends_at'>, now: Date = new Date()): boolean =>
  blockStatus(b, now) === 'live';

/** "ينتهي يوم الخميس 20 نوفمبر", in the store's own time zone and with Western digits. */
export function endsLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }).format(d);
  return `ينتهي يوم ${day}`;
}

/* ── What to draw, in order ───────────────────────────────────────────────────────────────── */

export type RenderItem =
  | { type: 'icons'; key: string; blocks: LinksBlock[] }
  | { type: 'block'; key: string; block: LinksBlock };

/** Links shown as icons that sit next to each other are drawn as one row. */
export function groupBlocks(blocks: LinksBlock[]): RenderItem[] {
  const items: RenderItem[] = [];
  for (const block of blocks) {
    const iconOnly = block.kind === 'link' && resolveLook('link', block.look).display === 'icon';
    const last = items[items.length - 1];
    if (iconOnly && last?.type === 'icons') last.blocks.push(block);
    else if (iconOnly) items.push({ type: 'icons', key: `icons:${block.id}`, blocks: [block] });
    else items.push({ type: 'block', key: block.id, block });
  }
  return items;
}

/* ── Making and checking blocks (the dashboard) ───────────────────────────────────────────── */

export function makeBlock(kind: BlockKind, patch: Partial<LinksBlock> = {}): LinksBlock {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    sort_order: 0,
    is_active: true,
    starts_at: null,
    ends_at: null,
    title: '',
    body: '',
    url: null,
    cta_label: null,
    image_url: null,
    icon: null,
    badge: null,
    coupon_code: null,
    look: cleanLook(kind, {}),
    ...patch,
  };
}

/** Quick starts for the dashboard: a social account, the app, the store, a way to reach the company. */
export interface LinkPreset {
  key: string;
  group: 'social' | 'store' | 'contact';
  label: string;
  patch: Partial<LinksBlock>;
}

const social = (key: string, label: string): LinkPreset => ({
  key,
  group: 'social',
  label,
  patch: { title: label, icon: key, look: { style: 'primary', display: 'icon' } },
});

export const LINK_PRESETS: LinkPreset[] = [
  social('facebook', 'فيسبوك'),
  social('instagram', 'إنستجرام'),
  social('whatsapp', 'واتساب'),
  social('tiktok', 'تيك توك'),
  social('youtube', 'يوتيوب'),
  social('telegram', 'تيليجرام'),
  social('x', 'X (تويتر)'),
  social('linkedin', 'لينكدإن'),
  { key: 'store', group: 'store', label: 'المتجر', patch: { title: 'تسوّق من المتجر', body: 'كتب دار الفتح الورقية والرقمية', url: '/', icon: 'store', look: { style: 'primary', display: 'button' } } },
  { key: 'books', group: 'store', label: 'كل الكتب', patch: { title: 'تصفّح كل الكتب', url: '/books', icon: 'books', look: { style: 'mint', display: 'button' } } },
  { key: 'apple', group: 'store', label: 'تطبيق App Store', patch: { title: 'حمّل التطبيق من App Store', icon: 'apple', look: { style: 'navy', display: 'button' } } },
  { key: 'googleplay', group: 'store', label: 'تطبيق Google Play', patch: { title: 'حمّل التطبيق من Google Play', icon: 'googleplay', look: { style: 'green', display: 'button' } } },
  { key: 'website', group: 'contact', label: 'موقع إلكتروني', patch: { title: 'موقعنا الإلكتروني', icon: 'website', look: { style: 'outline', display: 'button' } } },
  { key: 'phone', group: 'contact', label: 'اتصال', patch: { title: 'اتصل بنا', icon: 'phone', look: { style: 'mint', display: 'button' } } },
  { key: 'email', group: 'contact', label: 'بريد إلكتروني', patch: { title: 'راسلنا', icon: 'email', look: { style: 'mint', display: 'button' } } },
  { key: 'location', group: 'contact', label: 'موقعنا على الخريطة', patch: { title: 'موقعنا على الخريطة', icon: 'location', look: { style: 'outline', display: 'button' } } },
];

const COUPON = /^[A-Za-z0-9_-]{1,40}$/;

/** What is wrong with a block, in words for the admin. Only a block that shows needs to be right. */
export function validateBlock(b: LinksBlock): string[] {
  if (!b.is_active) return [];
  const problems: string[] = [];
  const look = resolveLook(b.kind, b.look);

  if (b.starts_at && b.ends_at && new Date(b.ends_at) <= new Date(b.starts_at)) problems.push('تاريخ النهاية لازم يكون بعد البداية');
  if (b.title.length > 160) problems.push('العنوان أطول من 160 حرف');
  if (b.body.length > 1500) problems.push('النص أطول من 1500 حرف');
  if ((b.badge ?? '').length > 30) problems.push('الشارة أطول من 30 حرف');
  if ((b.cta_label ?? '').length > 40) problems.push('نص الزر أطول من 40 حرف');

  const urlProblem = (label: string, required: boolean) => {
    const value = (b.url ?? '').trim();
    if (!value) {
      if (required) problems.push(`${label} مطلوب`);
      return;
    }
    if (!classifyUrl(value)) problems.push(`${label} مش صالح. ${URL_RULE}`);
  };

  switch (b.kind) {
    case 'link':
      if (!b.title.trim()) problems.push(look.display === 'icon' ? 'اكتب اسم الحساب (بيظهر لما حد يقف على الأيقونة)' : 'العنوان مطلوب');
      urlProblem('الرابط', true);
      break;
    case 'offer':
      if (!b.title.trim()) problems.push('عنوان العرض مطلوب');
      urlProblem('رابط الزر', false);
      if (b.coupon_code && !COUPON.test(b.coupon_code)) problems.push('كود الخصم حروف إنجليزية وأرقام بس، من غير مسافات');
      if (look.showEnd && !b.ends_at) problems.push('اختار تاريخ الانتهاء أو اقفل "إظهار تاريخ الانتهاء"');
      if (b.image_url && !isImageUrl(b.image_url)) problems.push(`رابط الصورة لازم يبدأ بـ ${ltr('https://')}`);
      break;
    case 'image':
      if (!b.image_url) problems.push('الصورة مطلوبة');
      else if (!isImageUrl(b.image_url)) problems.push(`رابط الصورة لازم يبدأ بـ ${ltr('https://')}`);
      urlProblem('رابط الصورة عند الضغط', false);
      break;
    case 'heading':
      if (!b.title.trim()) problems.push('نص العنوان مطلوب');
      break;
    case 'text':
      if (!b.body.trim()) problems.push('النص مطلوب');
      break;
    case 'divider':
      break;
  }
  return problems;
}

/** The row to save for a block at a position in the list. */
export function blockToRow(b: LinksBlock, index: number) {
  const clean = (v: string | null) => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
  };
  return {
    id: b.id,
    kind: b.kind,
    sort_order: index,
    is_active: b.is_active,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    title: b.title.trim(),
    body: b.body.trim(),
    url: clean(b.url),
    cta_label: clean(b.cta_label),
    image_url: clean(b.image_url),
    icon: clean(b.icon),
    badge: clean(b.badge),
    coupon_code: clean(b.coupon_code),
    look: cleanLook(b.kind, b.look),
  };
}
