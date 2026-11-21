// The category shelves of the website's home page: rows saved in home_layout (kind 'category-shelf'), one per catalog
// node. Pure helpers shared by the dashboard editor and (a copy of this file) the storefront.

export const SHELF_KIND = 'category-shelf';

/** One shelf as saved. */
export interface HomeShelf {
  section_key: string;
  node_id: string | null;
  title_ar: string | null;
  /** how many books the shelf holds (null = all of them) */
  item_limit: number | null;
  visible: boolean;
  sort_order: number;
}

export const shelfKeyFor = (nodeId: string) => `shelf:${nodeId}`;

/** What a typed «عدد الكتب» means: empty = all of them, otherwise a whole number from 1 to 60. */
export function parseShelfLimit(text: string): number | null | 'invalid' {
  const value = text.trim();
  if (value === '') return null;
  if (!/^\d{1,3}$/.test(value)) return 'invalid';
  const n = Number(value);
  return n >= 1 && n <= 60 ? n : 'invalid';
}

/** The shelves to draw, in their order: the ones switched on, with a node the website can show. */
export function shelvesToShow<T extends { section_key: string; node_id: string | null; visible: boolean; sort_order: number }>(
  rows: readonly T[],
  knownNodeIds: ReadonlySet<string>,
): T[] {
  return rows
    .filter((r) => r.visible && r.node_id != null && knownNodeIds.has(r.node_id))
    .sort((a, b) => a.sort_order - b.sort_order || a.section_key.localeCompare(b.section_key));
}
