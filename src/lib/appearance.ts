/* The store's look, as the dashboard («مظهر المتجر») sets it and the store reads it.
 *
 * This file is shared: the store and the dashboard keep a byte-identical copy, so a choice made in the
 * dashboard is understood the same way where it is drawn (the preview in the dashboard even opens the store
 * itself with the draft). Everything read from the database goes through the whitelists below, so a bad value
 * can only ever fall back to the house default, never reach a style as raw text.
 */

// ── The pattern ──────────────────────────────────────────────────────────────

/** How strongly the brand pattern shows, in percent of the designed strength: 0 hides it, 100 is as designed. */
export const PATTERN_STRENGTH_MIN = 0;
export const PATTERN_STRENGTH_MAX = 200;
export const PATTERN_STRENGTH_DEFAULT = 100;

export function clampStrength(value: unknown, fallback = PATTERN_STRENGTH_DEFAULT): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(PATTERN_STRENGTH_MAX, Math.max(PATTERN_STRENGTH_MIN, Math.round(n)));
}

/** The multiplier the stylesheets apply to the designed opacity. */
export const patternFactor = (strength: number): number => clampStrength(strength) / 100;

// ── Home sections ────────────────────────────────────────────────────────────

export type HomeSectionKey =
  | 'departments'
  | 'best-sellers'
  | 'new-arrivals'
  | 'offers'
  | 'categories'
  | 'intro-videos'
  | 'features';

export interface HomeSectionSetting {
  key: HomeSectionKey;
  visible: boolean;
}

export const HOME_SECTION_META: Record<HomeSectionKey, { label: string; hint: string }> = {
  departments: { label: 'السلاسل (الأقسام السريعة)', hint: 'بطاقات السلاسل تحت البانر مباشرة' },
  'best-sellers': { label: 'الأكثر مبيعًا', hint: 'الكتب التي اخترتها في «إدارة الإعلانات والأشرطة»' },
  'new-arrivals': { label: 'وصل حديثًا', hint: 'أحدث إصدارات الدار' },
  offers: { label: 'عروض وخصومات', hint: 'الكتب المخفّضة، وتظهر فقط حين يكون عندك عدد كافٍ منها' },
  categories: { label: 'صفوف التصنيفات', hint: 'صف لكل تصنيف من أول ثلاثة تصنيفات' },
  'intro-videos': { label: 'فيديوهات «من الدار»', hint: 'المقاطع التعريفية' },
  features: { label: 'مربعات المزايا', hint: 'الشحن والدفع والضمان فوق التذييل' },
};

/** The order the home page had before this was adjustable. */
export const HOME_SECTION_KEYS: HomeSectionKey[] = [
  'departments',
  'best-sellers',
  'new-arrivals',
  'offers',
  'categories',
  'intro-videos',
  'features',
];

export const DEFAULT_HOME_SECTIONS: HomeSectionSetting[] = HOME_SECTION_KEYS.map((key) => ({ key, visible: true }));

/**
 * What is saved, made complete and safe: only known sections, each once, in the saved order; a section the
 * saved list does not mention (one added later) goes to the end, shown.
 */
export function resolveHomeSections(raw: unknown): HomeSectionSetting[] {
  const out: HomeSectionSetting[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const key = (item as { key?: unknown }).key;
      if (typeof key !== 'string' || !(HOME_SECTION_KEYS as string[]).includes(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ key: key as HomeSectionKey, visible: (item as { visible?: unknown }).visible !== false });
    }
  }
  for (const key of HOME_SECTION_KEYS) if (!seen.has(key)) out.push({ key, visible: true });
  return out;
}

// ── The pattern strip (the row of crescent units used as a divider) ────────────────────────────────────

/**
 * uniform: every unit is the same drawing, copied exactly (three navy crescents and one teal, as the brand sheet).
 * varied: each unit keeps its four crescents but they trade colours among the house colours, from one unit to the next.
 */
export const STRIP_ARRANGEMENTS = ['uniform', 'varied'] as const;
export type StripArrangement = (typeof STRIP_ARRANGEMENTS)[number];
export const STRIP_ARRANGEMENT_LABEL: Record<StripArrangement, string> = {
  uniform: 'متطابق (كل الوحدات نسخة واحدة)',
  varied: 'متنوع (ألوان الوحدات بتتبدّل)',
};
export const STRIP_ARRANGEMENT_DEFAULT: StripArrangement = 'uniform';

/** A crescent's colour: the base colour (navy by day, mint at night) or one of the two accents. */
export type CrescentTone = 'base' | 'teal' | 'green';

/** What the brand sheet draws: one teal crescent in every unit, the other three in the base colour. */
const UNIFORM_UNIT: CrescentTone[] = ['base', 'teal', 'base', 'base'];

/** A small, fixed random sequence from a number: the same seed always gives the same strip, so it never flickers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number from any text (a block's id), so each placed strip has its own arrangement, and keeps it. */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The colour of each of the four crescents of each unit. Uniform copies one unit; varied gives every unit its own
 * placing of the two accents among the base colour (never the same as the unit before it).
 */
export function stripTones(arrangement: StripArrangement, units: number, seed = 1): CrescentTone[][] {
  if (arrangement === 'uniform') return Array.from({ length: units }, () => [...UNIFORM_UNIT]);
  const random = seeded(seed);
  const out: CrescentTone[][] = [];
  let previous = '';
  for (let u = 0; u < units; u++) {
    let unit: CrescentTone[] = UNIFORM_UNIT;
    for (let attempt = 0; attempt < 12; attempt++) {
      const slots = [0, 1, 2, 3];
      const teal = slots.splice(Math.floor(random() * slots.length), 1)[0];
      const green = slots.splice(Math.floor(random() * slots.length), 1)[0];
      const next: CrescentTone[] = ['base', 'base', 'base', 'base'];
      next[teal] = 'teal';
      next[green] = 'green';
      unit = next;
      if (unit.join() !== previous) break;
    }
    previous = unit.join();
    out.push(unit);
  }
  return out;
}

// ── Buttons ──────────────────────────────────────────────────────────────────

export type ButtonKey = 'view_all' | 'view_category' | 'add_to_cart' | 'quick_buy';

export const BUTTON_KEYS: ButtonKey[] = ['view_all', 'view_category', 'add_to_cart', 'quick_buy'];

export const BUTTON_META: Record<ButtonKey, { label: string; hint: string; sample: string }> = {
  view_all: { label: 'عرض الكل', hint: 'الزر بجوار عنوان كل قائمة كتب (وصل حديثًا، عروض...)', sample: 'عرض الكل' },
  view_category: { label: 'عرض التصنيف', hint: 'الزر بجوار عنوان صفوف التصنيفات', sample: 'عرض التصنيف' },
  add_to_cart: { label: 'أضف للسلة', hint: 'الزر الرئيسي على بطاقة الكتاب وفي صفحته', sample: 'أضف للسلة' },
  quick_buy: { label: 'الشراء السريع', hint: 'الزر تحت «أضف للسلة»', sample: 'شراء سريع' },
};

/** The four house colours, and nothing else: a button can only be one of them (or stay as designed). */
export const BRAND_COLORS = {
  navy: { label: 'كحلي', hex: '#054180' },
  teal: { label: 'تركواز', hex: '#2aa3ab' },
  green: { label: 'أخضر', hex: '#067e70' },
  mint: { label: 'نعناعي', hex: '#dae8e6' },
} as const;

export type BrandColorKey = keyof typeof BRAND_COLORS;
export type ButtonColor = 'default' | BrandColorKey;
export const BUTTON_COLORS: ButtonColor[] = ['default', 'navy', 'teal', 'green', 'mint'];

/** How light or dark the colour is: -2 lightest ... 0 as in the house colour ... +2 darkest. */
export type Tone = -2 | -1 | 0 | 1 | 2;
export const TONES: Tone[] = [-2, -1, 0, 1, 2];
export const TONE_LABELS: Record<Tone, string> = { [-2]: 'أفتح كثيرًا', [-1]: 'أفتح', 0: 'الأصلي', 1: 'أغمق', 2: 'أغمق كثيرًا' };

export interface ButtonStyle {
  color: ButtonColor;
  tone: Tone;
}

export type ButtonStyles = Record<ButtonKey, ButtonStyle>;

export const DEFAULT_BUTTON_STYLE: ButtonStyle = { color: 'default', tone: 0 };

export const DEFAULT_BUTTON_STYLES: ButtonStyles = {
  view_all: { ...DEFAULT_BUTTON_STYLE },
  view_category: { ...DEFAULT_BUTTON_STYLE },
  add_to_cart: { ...DEFAULT_BUTTON_STYLE },
  quick_buy: { ...DEFAULT_BUTTON_STYLE },
};

function pickColor(value: unknown): ButtonColor {
  return typeof value === 'string' && (BUTTON_COLORS as string[]).includes(value) ? (value as ButtonColor) : 'default';
}

function pickTone(value: unknown): Tone {
  return typeof value === 'number' && (TONES as number[]).includes(value) ? (value as Tone) : 0;
}

export function resolveButtonStyles(raw: unknown): ButtonStyles {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as ButtonStyles;
  for (const key of BUTTON_KEYS) {
    const item = source[key];
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const color = pickColor(obj.color);
    out[key] = { color, tone: color === 'default' ? 0 : pickTone(obj.tone) };
  }
  return out;
}

// ── Colour maths (hex only, so nothing outside the house colours is ever produced by chance) ─────────────

const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toHex = (rgb: number[]): string =>
  `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

function mix(hex: string, towards: [number, number, number], amount: number): string {
  const c = toRgb(hex);
  return toHex(c.map((v, i) => v + (towards[i] - v) * amount));
}

/** Each step is a 14% move towards white (lighter) or black (darker). */
const TONE_STEP = 0.14;

export function shade(hex: string, tone: number): string {
  if (tone === 0) return hex;
  return tone < 0 ? mix(hex, [255, 255, 255], -tone * TONE_STEP) : mix(hex, [0, 0, 0], tone * TONE_STEP);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or the house navy, whichever reads better on this colour. */
export function readableOn(bg: string): string {
  const navy = BRAND_COLORS.navy.hex;
  return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, navy) ? '#ffffff' : navy;
}

export interface ButtonPaint {
  bg: string;
  fg: string;
  hover: string;
  /** The text colour on the hover background. */
  hoverFg: string;
}

/** The paint for a chosen colour and tone, or null when the button keeps the colours it was designed with. */
export function buttonPaint(style: ButtonStyle): ButtonPaint | null {
  if (style.color === 'default') return null;
  const base = BRAND_COLORS[style.color].hex;
  const bg = shade(base, style.tone);
  // The hover is one step further along the same way the colour already leans (darker, unless it is the darkest).
  const hover = shade(base, Math.min(2, style.tone + 1) === style.tone ? style.tone - 1 : style.tone + 1);
  return { bg, fg: readableOn(bg), hover, hoverFg: readableOn(hover) };
}

/** The custom properties the stylesheets read: only for buttons that were given a colour. */
export function buttonCssVars(styles: ButtonStyles): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of BUTTON_KEYS) {
    const paint = buttonPaint(styles[key]);
    if (!paint) continue;
    const name = key.replace(/_/g, '-');
    vars[`--ab-${name}-bg`] = paint.bg;
    vars[`--ab-${name}-fg`] = paint.fg;
    vars[`--ab-${name}-hover`] = paint.hover;
    vars[`--ab-${name}-hover-fg`] = paint.hoverFg;
  }
  return vars;
}

// ── The whole appearance ─────────────────────────────────────────────────────

export interface StorefrontAppearance {
  pattern_strength: number;
  /** How the store's pattern strips (between the home sections) are arranged. */
  strip_arrangement: StripArrangement;
  home_sections: HomeSectionSetting[];
  button_styles: ButtonStyles;
}

export const DEFAULT_APPEARANCE: StorefrontAppearance = {
  pattern_strength: PATTERN_STRENGTH_DEFAULT,
  strip_arrangement: STRIP_ARRANGEMENT_DEFAULT,
  home_sections: DEFAULT_HOME_SECTIONS,
  button_styles: DEFAULT_BUTTON_STYLES,
};

export const APPEARANCE_COLUMNS = 'pattern_strength, strip_arrangement, home_sections, button_styles';
/** What to ask for from a database that does not have the strip column yet. */
export const LEGACY_APPEARANCE_COLUMNS = 'pattern_strength, home_sections, button_styles';

export function resolveAppearance(raw: unknown): StorefrontAppearance {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    pattern_strength: clampStrength(r.pattern_strength),
    strip_arrangement: (STRIP_ARRANGEMENTS as readonly string[]).includes(r.strip_arrangement as string) ? (r.strip_arrangement as StripArrangement) : STRIP_ARRANGEMENT_DEFAULT,
    home_sections: resolveHomeSections(r.home_sections),
    button_styles: resolveButtonStyles(r.button_styles),
  };
}

/** The row to save: the same shape, already resolved, so what reaches the database is always clean. */
export function appearanceToRow(a: StorefrontAppearance) {
  const clean = resolveAppearance(a);
  return {
    id: 1,
    pattern_strength: clean.pattern_strength,
    strip_arrangement: clean.strip_arrangement,
    home_sections: clean.home_sections,
    button_styles: clean.button_styles,
  };
}

// ── Preview: the dashboard opens the store with a draft, before anything is saved ────────────────────────

export const PREVIEW_PARAM = 'previewLook';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodePreview(a: StorefrontAppearance): string {
  return toBase64Url(JSON.stringify(resolveAppearance(a)));
}

/** The draft in a store address, or null when there is none or it is not a draft this file wrote. */
export function decodePreview(search: string): StorefrontAppearance | null {
  try {
    const value = new URLSearchParams(search).get(PREVIEW_PARAM);
    if (!value || value.length > 4000) return null;
    return resolveAppearance(JSON.parse(fromBase64Url(value)));
  } catch {
    return null;
  }
}
