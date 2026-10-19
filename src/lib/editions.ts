/**
 * What a book says about the editions it is sold in. A book in one edition says nothing about it; a book in
 * several says "عدة خيارات" (it used to count them: "طبعة واحدة", "طبعتان", "٣ طبعات").
 */
export const MANY_EDITIONS_LABEL = 'عدة خيارات';

export function editionsLabel(count: number): string | null {
  return Math.floor(Number(count) || 0) > 1 ? MANY_EDITIONS_LABEL : null;
}
