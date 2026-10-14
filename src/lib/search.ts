/**
 * Search over the catalog, for the live search in the header and the books page.
 *
 * Arabic is written in several ways that mean the same word — with or without short
 * vowels, alef with or without a hamza, ى and ي, ة and ه — and people type digits in
 * either script, so both the query and the books are reduced to one plain form before they
 * are compared. A query is split into words and a book matches when every word is found
 * somewhere in it, so word order and extra words in the title don't matter.
 */

interface Searchable {
  title: string;
  author?: string | null;
  description?: string | null;
  category_name?: string | null;
  type?: string | null;
}

// Short vowels and other marks (U+064B–U+065F, the dagger alef) and the stretching tatweel.
const MARKS = /[ً-ٰٟـ]/g;

/** The plain form two spellings of the same text share. */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // Persian digits
    .replace(/\s+/g, ' ')
    .trim();
}

/** The words of a query, normalized. */
export function searchTerms(query: string): string[] {
  const text = normalizeSearchText(query);
  return text ? text.split(' ') : [];
}

interface Haystack {
  title: string;
  author: string;
  tags: string; // category and type
  description: string;
}

// Books are re-searched on every keystroke; normalizing their text once is enough.
const haystacks = new WeakMap<object, Haystack>();

function haystackOf(product: Searchable): Haystack {
  let cached = haystacks.get(product);
  if (!cached) {
    cached = {
      title: normalizeSearchText(product.title ?? ''),
      author: normalizeSearchText(product.author ?? ''),
      tags: normalizeSearchText(`${product.category_name ?? ''} ${product.type ?? ''}`),
      description: normalizeSearchText(product.description ?? ''),
    };
    haystacks.set(product, cached);
  }
  return cached;
}

const hasAll = (text: string, terms: string[]) => terms.every((term) => text.includes(term));

/**
 * How well the book matches (lower is better), or null when it doesn't: its title starts
 * with the query (ignoring a leading "ال"), then the title has all the words, then title + author, then also category
 * and type, and last the description.
 */
export function matchRank(product: Searchable, terms: string[]): number | null {
  if (terms.length === 0) return null;
  const h = haystackOf(product);
  // "نحو" should find "النحو بين يديك" first: the article is not part of what was meant.
  const query = terms.join(' ');
  if (h.title.startsWith(query) || h.title.replace(/^ال/, '').startsWith(query)) return 0;
  if (hasAll(h.title, terms)) return 1;
  if (hasAll(`${h.title} ${h.author}`, terms)) return 2;
  if (hasAll(`${h.title} ${h.author} ${h.tags}`, terms)) return 3;
  if (hasAll(`${h.title} ${h.author} ${h.tags} ${h.description}`, terms)) return 4;
  return null;
}

export function matchesSearch(product: Searchable, query: string): boolean {
  return matchRank(product, searchTerms(query)) !== null;
}

/** The books that match, best first (ties in title order). Empty for an empty query. */
export function searchProducts<T extends Searchable>(products: readonly T[], query: string): T[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  const ranked: { product: T; rank: number }[] = [];
  for (const product of products) {
    const rank = matchRank(product, terms);
    if (rank !== null) ranked.push({ product, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.product.title.localeCompare(b.product.title, 'ar'))
    .map((entry) => entry.product);
}
