/**
 * The store's pages with their own <head>: a book, a category, the main pages. The app's HTML is
 * sent as it is with the title, description, preview image and structured data of the page written
 * in, so search engines and link previews (which don't run the app) see the right thing. The app
 * then takes over exactly as before.
 *
 * Anything that goes wrong falls back to the plain app HTML, so a page never breaks because of this.
 */
import { booksListSeo, bookSeo, injectSeo, staticSeo, titleFor, type Seo, type SeoBook } from '../src/lib/seo';
import { UUID, rest, safeFilterValue, siteOrigin } from './_shared';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=300, stale-while-revalidate=3600';

interface CatalogRow {
  product_id: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  isbn: string | null;
  category_name: string | null;
  category_slug: string | null;
  min_price: number | null;
  max_price: number | null;
  currency: string | null;
  country_code: string | null;
}

/** The book; null when there is no such book; undefined when the database did not answer. */
async function loadBook(id: string): Promise<SeoBook | null | undefined> {
  const [rows, variants] = await Promise.all([
    rest<CatalogRow>(
      `products_public_catalog?select=product_id,title,author,description,cover_url,isbn,category_name,category_slug,min_price,max_price,currency,country_code&product_id=eq.${id}&limit=20`,
    ),
    rest<{ is_available: boolean | null; country_code: string | null }>(
      `product_variants_public?select=is_available,country_code&product_id=eq.${id}&limit=50`,
    ),
  ]);
  if (rows === null) return undefined;
  if (rows.length === 0) return null;
  // The store's home market first (prices differ by country); any other country otherwise.
  const row = rows.find((r) => r.country_code === 'EG') ?? rows[0];
  const sameCountry = (variants ?? []).filter((v) => v.country_code === row.country_code);
  return {
    id: row.product_id,
    title: row.title,
    author: row.author,
    description: row.description,
    coverUrl: row.cover_url,
    isbn: row.isbn,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    minPrice: row.min_price == null ? null : Number(row.min_price),
    maxPrice: row.max_price == null ? null : Number(row.max_price),
    currency: row.currency,
    inStock: variants ? sameCountry.some((v) => v.is_available) : null,
  };
}

async function seoFor(kind: string, params: URLSearchParams, origin: string): Promise<{ seo: Seo; status: number } | null> {
  if (kind === 'book') {
    const id = params.get('id') ?? '';
    if (!UUID.test(id)) return { seo: { ...staticSeo('home', origin), title: titleFor('الكتاب غير موجود'), path: '/books', noindex: true }, status: 404 };
    const book = await loadBook(id);
    // The database didn't answer: leave the app to show the book as it always did.
    if (book === undefined) return null;
    if (book === null) return { seo: { ...staticSeo('home', origin), title: titleFor('الكتاب غير موجود'), path: '/books', noindex: true }, status: 404 };
    return { seo: bookSeo(book, origin), status: 200 };
  }

  if (kind === 'books') {
    const category = safeFilterValue(params.get('category'));
    const series = safeFilterValue(params.get('series'));
    const searched = ['q', 'sort', 'type'].some((key) => (params.get(key) ?? '') !== '');
    let categoryName: string | null = null;
    let seriesName: string | null = null;
    if (category) categoryName = (await rest<{ name: string }>(`categories?select=name&slug=eq.${encodeURIComponent(category)}&limit=1`))?.[0]?.name ?? null;
    else if (series) seriesName = (await rest<{ name: string }>(`book_series?select=name&id=eq.${encodeURIComponent(series)}&limit=1`))?.[0]?.name ?? null;
    return { seo: booksListSeo(origin, { categorySlug: category, categoryName, seriesName, seriesId: series, searched }), status: 200 };
  }

  if (kind === 'categories' || kind === 'about' || kind === 'contact' || kind === 'policies' || kind === 'home') {
    return { seo: staticSeo(kind, origin), status: 200 };
  }
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = siteOrigin(request);
  try {
    const base = await fetch(new URL('/index.html', url.origin));
    if (!base.ok) throw new Error(`index.html ${base.status}`);
    const html = await base.text();

    const found = await seoFor(url.searchParams.get('kind') ?? 'home', url.searchParams, origin);
    if (!found) return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=60' } });

    return new Response(injectSeo(html, found.seo, origin), {
      status: found.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': found.status === 200 ? CACHE : 'public, s-maxage=60',
        ...(found.seo.noindex ? { 'x-robots-tag': 'noindex' } : {}),
      },
    });
  } catch {
    // Last resort: the app itself.
    return fetch(new URL('/index.html', url.origin));
  }
}
