/**
 * How many editions a book is sold in, said the way Arabic counts: one and two have their own words,
 * three to ten take the plural, eleven on the singular. Digits in Arabic, like every price on the site.
 */
export function editionsLabel(count: number): string {
  const n = Math.max(1, Math.floor(Number(count) || 0));
  if (n === 1) return 'طبعة واحدة';
  if (n === 2) return 'طبعتان';
  const digits = n.toLocaleString('ar-EG');
  return n <= 10 ? `${digits} طبعات` : `${digits} طبعة`;
}
