/**
 * What search engines and link previews (WhatsApp, Facebook, X…) learn about a page.
 *
 * The store is a single-page app, so a crawler that doesn't run JavaScript — which is what
 * the link previews do — only sees the HTML it is sent. The edge functions in /api send each
 * book (and the other main pages) with its own title, description, image and structured data
 * already in the <head>, and the app keeps them up to date as the visitor moves around. Both
 * sides build the tags from the helpers here, so they always agree.
 *
 * Nothing here knows the site's address: it is passed in (the production domain, or the one
 * the request came to), so moving to a new domain needs no change in this file.
 */

export const SITE_NAME = 'دار الفتح للنشر والتوزيع';
export const DEFAULT_DESCRIPTION =
  'المتجر الرسمي لدار الفتح للنشر والتوزيع: كتب تعليمية وإسلامية للأطفال والمعلمين، نسخ ورقية ورقمية، وشحن لجميع المحافظات.';
export const LOGO_PATH = '/branding/dar-alfath-logo.jpeg';

export interface Seo {
  /** The whole document title. */
  title: string;
  description: string;
  /** Where the page canonically lives: a path with its query, e.g. "/books?category=nahw". */
  path: string;
  /** Preview image: absolute, or a path on the site. */
  image?: string;
  type?: 'website' | 'book';
  /** Keep the page out of search results (private pages, searches, unknown books). */
  noindex?: boolean;
  jsonLd?: object[];
}

/** "page — site", or just the site name for the home page. */
export const titleFor = (page?: string) => (page ? `${page} — ${SITE_NAME}` : `${SITE_NAME} — المتجر الرسمي لكتب دار الفتح`);

export function absoluteUrl(origin: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * A small version of a cover for previews. Covers are uploaded at up to 2048px and run past
 * a megabyte, and WhatsApp drops a preview image that large; the storage service can resize
 * on the way out, which brings a cover to a few dozen KB. Anything else is passed through.
 */
export function previewImage(url: string | null | undefined, origin: string): string {
  if (!url) return absoluteUrl(origin, LOGO_PATH);
  const match = /^(https?:\/\/[^/]+)\/storage\/v1\/object\/public\/([^?#]+)/.exec(url);
  if (!match) return absoluteUrl(origin, url);
  return `${match[1]}/storage/v1/render/image/public/${match[2]}?width=600&height=600&resize=contain&quality=75`;
}

/** One line of plain text, cut at a word boundary. */
export function shorten(text: string | null | undefined, max = 155): string {
  const plain = (text ?? '').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s،,.:؛;-]+$/, '')}…`;
}

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON for a <script type="application/ld+json">: nothing in it can close the tag. */
export const jsonLdText = (data: object) =>
  JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/* ── The pages that are the same for everyone ──────────────────────── */

export const STATIC_SEO: Record<string, { title: string; description: string; path: string }> = {
  home: { title: titleFor(), description: DEFAULT_DESCRIPTION, path: '/' },
  books: {
    title: titleFor('كل الكتب'),
    description: 'تصفّح كتالوج دار الفتح كاملًا: كتب التجويد والنحو والإملاء والقراءة والمناهج، بنسخ ورقية ورقمية وأسعار واضحة.',
    path: '/books',
  },
  categories: {
    title: titleFor('التصنيفات'),
    description: 'تصنيفات كتب دار الفتح: منهج الدورة الصيفية، كتب المعلم، كتب القراءة، سلسلة النحو بين يديك وغيرها.',
    path: '/categories',
  },
  about: {
    title: titleFor('عن الدار'),
    description: 'تعرّف على دار الفتح للنشر والتوزيع: دار تختار إصداراتها بعناية وتقدّم كتبًا تعليمية وإسلامية بنسخ ورقية ورقمية.',
    path: '/about',
  },
  contact: {
    title: titleFor('تواصل معنا'),
    description: 'تواصل مع فريق دار الفتح للنشر والتوزيع للاستفسار عن الكتب والطلبات والشحن.',
    path: '/contact',
  },
  policies: {
    title: titleFor('سياسة المتجر'),
    description: 'سياسات متجر دار الفتح: الشحن والتوصيل، الاسترجاع والاستبدال، الخصوصية وشروط الاستخدام.',
    path: '/policies',
  },
};

export function staticSeo(key: keyof typeof STATIC_SEO, origin: string): Seo {
  const page = STATIC_SEO[key];
  return {
    ...page,
    image: absoluteUrl(origin, LOGO_PATH),
    type: 'website',
    jsonLd: key === 'home' ? [organizationLd(origin), websiteLd(origin)] : undefined,
  };
}

export function organizationLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: absoluteUrl(origin, '/'),
    logo: absoluteUrl(origin, LOGO_PATH),
  };
}

/** Lets a search engine offer a search box that goes straight to the store's own search. */
export function websiteLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absoluteUrl(origin, '/'),
    inLanguage: 'ar',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: absoluteUrl(origin, '/books?q={search_term_string}') },
      'query-input': 'required name=search_term_string',
    },
  };
}

/* ── A list of books: all of them, or one category / series ──────── */

export function booksListSeo(
  origin: string,
  opts: { categorySlug?: string | null; categoryName?: string | null; seriesName?: string | null; seriesId?: string | null; searched?: boolean },
): Seo {
  const base = staticSeo('books', origin);
  const name = opts.categoryName || opts.seriesName;
  if (!name) return { ...base, noindex: opts.searched || undefined };
  const path = opts.categorySlug
    ? `/books?category=${encodeURIComponent(opts.categorySlug)}`
    : `/books?series=${encodeURIComponent(opts.seriesId ?? '')}`;
  return {
    ...base,
    title: titleFor(name.trim()),
    description: shorten(`كتب «${name.trim()}» من دار الفتح للنشر والتوزيع: تصفّح الإصدارات بنسخها الورقية والرقمية وأسعارها.`),
    path,
    noindex: opts.searched || undefined,
  };
}

/* ── One book ──────────────────────────────────────────────────────── */

export interface SeoBook {
  id: string;
  title: string;
  author?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  isbn?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  /** ISO code, e.g. "EGP". */
  currency?: string | null;
  /** Unknown when not checked: no availability is claimed then. */
  inStock?: boolean | null;
}

export function bookSeo(book: SeoBook, origin: string): Seo {
  // One space between words, whatever the database has (a stray double space is common in titles).
  const title = book.title.replace(/\s+/g, ' ').trim();
  const author = book.author?.replace(/\s+/g, ' ').trim();
  const url = absoluteUrl(origin, `/book/${book.id}`);
  const image = previewImage(book.coverUrl, origin);
  const price = book.minPrice && book.minPrice > 0 ? book.minPrice : null;

  const description = shorten(
    book.description?.trim() ||
      `اشترِ كتاب «${title}»${author ? ` لـ ${author}` : ''} من دار الفتح للنشر والتوزيع${book.categoryName ? ` — ${book.categoryName.trim()}` : ''}، بنسخ ورقية ورقمية.`,
  );

  let offers: object | undefined;
  if (price && book.currency) {
    const availability = book.inStock == null ? undefined : book.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
    const range = book.maxPrice && book.maxPrice > price;
    offers = {
      '@type': range ? 'AggregateOffer' : 'Offer',
      priceCurrency: book.currency,
      ...(range ? { lowPrice: price, highPrice: book.maxPrice } : { price }),
      ...(availability ? { availability } : {}),
      url,
    };
  }

  const product = {
    '@context': 'https://schema.org',
    '@type': ['Product', 'Book'],
    name: title,
    image: [image],
    description,
    url,
    ...(author ? { author: { '@type': 'Person', name: author } } : {}),
    ...(book.isbn ? { isbn: book.isbn } : {}),
    publisher: { '@type': 'Organization', name: SITE_NAME },
    brand: { '@type': 'Brand', name: SITE_NAME },
    ...(book.categoryName ? { category: book.categoryName.trim() } : {}),
    ...(offers ? { offers } : {}),
  };

  const crumbs = [
    { name: 'الرئيسية', url: absoluteUrl(origin, '/') },
    { name: 'الكتب', url: absoluteUrl(origin, '/books') },
    ...(book.categorySlug && book.categoryName
      ? [{ name: book.categoryName.trim(), url: absoluteUrl(origin, `/books?category=${encodeURIComponent(book.categorySlug)}`) }]
      : []),
    { name: title, url },
  ];
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, name: crumb.name, item: crumb.url })),
  };

  return {
    title: titleFor(title),
    description,
    path: `/book/${book.id}`,
    image,
    type: 'book',
    jsonLd: [product, breadcrumbs],
  };
}

/* ── The <head> tags ───────────────────────────────────────────────── */

/** The tags for a page, as HTML (for the edge functions, which write them into the page). */
export function headTags(seo: Seo, origin: string): string {
  const url = absoluteUrl(origin, seo.path);
  const image = seo.image ? absoluteUrl(origin, seo.image) : absoluteUrl(origin, LOGO_PATH);
  const title = escapeHtml(seo.title);
  const description = escapeHtml(seo.description);
  const tags = [
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${seo.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:locale" content="ar_AR" />`,
    `<meta property="og:type" content="${seo.type === 'book' ? 'book' : 'website'}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    ...(seo.jsonLd ?? []).map((data) => `<script type="application/ld+json">${jsonLdText(data)}</script>`),
  ];
  return tags.map((tag) => tag.replace(/^<(meta|link|script)/, '<$1 data-seo="1"')).join('\n    ');
}

/** Puts a page's title and tags into the app's HTML (replacing the generic ones it ships with). */
export function injectSeo(html: string, seo: Seo, origin: string): string {
  const withoutGeneric = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s[^>]*?name="description"[^>]*>\s*/i, '')
    .replace(/<meta\s[^>]*?name="robots"[^>]*>\s*/i, '')
    .replace(/<link\s[^>]*?rel="canonical"[^>]*>\s*/i, '')
    .replace(/<meta\s[^>]*?(?:property|name)="(?:og|twitter):[^"]*"[^>]*>\s*/gi, '')
    .replace(/<script\s[^>]*?data-seo="1"[^>]*>[\s\S]*?<\/script>\s*/gi, '');
  const block = `<title>${escapeHtml(seo.title)}</title>\n    ${headTags(seo, origin)}\n  `;
  return withoutGeneric.includes('</head>') ? withoutGeneric.replace('</head>', `${block}</head>`) : `${block}${withoutGeneric}`;
}

/* ── sitemap.xml and robots.txt ────────────────────────────────────── */

export interface SitemapEntry {
  path: string;
  lastmod?: string | null;
  priority?: number;
}

export function sitemapXml(origin: string, entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? new Date(entry.lastmod) : null;
      return [
        '  <url>',
        `    <loc>${escapeHtml(absoluteUrl(origin, entry.path))}</loc>`,
        lastmod && !Number.isNaN(lastmod.getTime()) ? `    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : '',
        entry.priority != null ? `    <priority>${entry.priority.toFixed(1)}</priority>` : '',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** The temporary *.vercel.app addresses are kept out of search; a real domain is open. */
export function robotsTxt(origin: string, host: string): string {
  if (host.endsWith('.vercel.app')) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(origin, '/sitemap.xml')}\n`;
}
