// Whether customers see the NUMBER of copies available, as set in the dashboard («إدارة المخزون»): one switch for the website and
// one for the app (the app reads the same setting). Pure helpers (no network, no React). Only an explicit `false` hides the count:
// anything missing or odd keeps it shown, exactly as the website has always shown it, so a bad value can never silently hide stock.

export interface StockVisibility {
  /** the website shows «متوفر N نسخة», «باقي N نسخ فقط» and «آخر N نسخ» */
  web: boolean;
  /** the app shows the number of copies */
  app: boolean;
}

export const DEFAULT_STOCK_VISIBILITY: StockVisibility = { web: true, app: true };

/** The column of storefront_appearance (row id = 1) that holds it. */
export const STOCK_VISIBILITY_COLUMN = 'show_stock_count';

export function resolveStockVisibility(raw: unknown): StockVisibility {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { web: r.web !== false, app: r.app !== false };
}

/** The line under an edition on a book's page: its number of copies when that may be shown, otherwise just whether any are left. */
export function editionAvailability(
  edition: { is_digital: boolean; is_available: boolean; availability_text?: string | null },
  showCount: boolean,
): string {
  if (edition.is_digital) return '⚡ رقمي فوري';
  if (showCount) return edition.availability_text || 'غير متوفر';
  return edition.is_available ? 'متوفر' : 'غير متوفر';
}

/** The «only a few left» note: with the number, or without it when the count is hidden. */
export function lastCopiesNote(left: number, showCount: boolean): string {
  if (!showCount) return 'آخر النسخ';
  const n = Number(left).toLocaleString('ar-EG');
  return `باقي ${n} ${left === 1 ? 'نسخة' : left === 2 ? 'نسختان' : 'نسخ'} فقط`;
}

/** The card's «last copies» badge: with the number, or without it when the count is hidden. */
export function lastCopiesBadge(left: number, showCount: boolean): string {
  if (!showCount) return 'آخر النسخ';
  return `آخر ${Number(left).toLocaleString('ar-EG')} ${left === 1 ? 'نسخة' : 'نسخ'}`;
}
