/** What the stock count needs to know about one copy of a book (a row of product_variants_public). */
export interface CopyStock {
  is_digital?: boolean | null;
  is_available?: boolean | null;
  available_stock?: number | string | null;
}

/**
 * How many paper copies of a book can be bought, for the «آخر نسخ» flag and note: the copies in stock added together.
 * null when it can't be said (no copies, no count, or a digital copy is on sale: there is no shortage of those).
 */
export function physicalStock(copies: readonly CopyStock[] | null | undefined): number | null {
  if (!copies || copies.length === 0) return null;
  if (copies.some((c) => c.is_digital && c.is_available !== false)) return null;
  let total = 0;
  let counted = false;
  for (const c of copies) {
    if (c.is_digital || !c.is_available) continue;
    const n = typeof c.available_stock === 'string' ? Number(c.available_stock) : c.available_stock;
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue;
    total += Math.floor(n);
    counted = true;
  }
  return counted ? total : null;
}

/** The paper stock of every book, from all the copies' rows at once. */
export function stockByBook(rows: readonly (CopyStock & { product_id: string })[]): Map<string, number | null> {
  const groups = new Map<string, CopyStock[]>();
  for (const row of rows) {
    const list = groups.get(row.product_id);
    if (list) list.push(row); else groups.set(row.product_id, [row]);
  }
  const out = new Map<string, number | null>();
  for (const [id, copies] of groups) out.set(id, physicalStock(copies));
  return out;
}
