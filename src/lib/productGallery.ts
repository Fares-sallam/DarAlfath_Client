/** One picture of a book's gallery, and the edition it belongs to (null: the book's own, for every edition). */
export type GalleryImage = {
  url: string;
  variant_id: string | null;
};

const distinct = (urls: (string | null | undefined)[]) => [...new Set(urls.filter((url): url is string => Boolean(url)))];

/**
 * The pictures to show while `variantId` is the edition chosen (null while none is):
 *   - an edition that has pictures of its own shows those, and only those;
 *   - an edition without any (or no edition chosen yet) shows what the book has: its cover first, then
 *     every picture it has, whichever edition they belong to.
 * `rows` are the gallery's pictures in display order. `fallback` stands in for them when the book has no
 * gallery rows at all (the catalog's own list of pictures).
 */
export function galleryFor(
  cover: string | null | undefined,
  rows: GalleryImage[],
  fallback: string[],
  variantId: string | null,
): string[] {
  if (variantId) {
    const own = distinct(rows.filter((row) => row.variant_id === variantId).map((row) => row.url));
    if (own.length > 0) return own;
  }
  return distinct([cover, ...(rows.length > 0 ? rows.map((row) => row.url) : fallback)]);
}
