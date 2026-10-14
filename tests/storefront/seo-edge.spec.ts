import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../fixtures';
import pageHandler from '../../api/page';
import sitemapHandler from '../../api/sitemap';
import robotsHandler from '../../api/robots';
import { bookSeo, injectSeo, jsonLdText, previewImage, shorten, staticSeo } from '../../src/lib/seo';

// The edge functions in /api, run here with a made-up database and index.html (no network, nothing real is read):
// what a search engine or a link preview is sent for a book, a category and the main pages.

const SUPABASE = 'https://example.supabase.co';
const INDEX_HTML = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8');
const ID = '0b617ab5-2d5a-4915-82bb-0f911a2ca678';
const OTHER_ID = '11111111-2222-4333-8444-555555555555';

const BOOK = {
  product_id: ID,
  title: 'فتح الرحمن في تعليم كلمات القرآن إصدار 2026',
  author: 'أكاديمية الفتح العالمية',
  description: 'هذا الإصدار مصمم بعناية ليمنح القارئ تجربة قراءة مريحة، مع عرض واضح ونسخ متعددة تناسب الاستخدامات المختلفة، ويصلح للمعلمين والطلاب على حد سواء في الدورات الصيفية.',
  cover_url: `${SUPABASE}/storage/v1/object/public/book-covers/abc.jpg`,
  isbn: '9781234567897',
  category_name: 'منهج الدورة الصيفية ',
  category_slug: 'منهج-الدورة-الصيفية',
  min_price: 35,
  max_price: 35,
  currency: 'EGP',
  country_code: 'EG',
  created_at: '2026-10-03T10:00:00Z',
};

type Rows = Record<string, unknown[] | 'fail'>;

/** Replaces fetch: index.html from disk, the database from `rows` (keyed by table name). */
function mockWorld(rows: Rows, env: Record<string, string | undefined> = {}) {
  const saved = { fetch: globalThis.fetch, env: { ...process.env } };
  process.env.VITE_SUPABASE_URL = SUPABASE;
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.VITE_SITE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const queries: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === '/index.html') return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html' } });
    if (url.origin === SUPABASE) {
      queries.push(decodeURIComponent(url.pathname + url.search));
      const table = url.pathname.replace('/rest/v1/', '');
      const data = rows[table];
      if (data === 'fail' || data === undefined) return new Response('nope', { status: 500 });
      const id = /product_id=eq\.([^&]+)/.exec(url.search)?.[1];
      return Response.json(id ? (data as { product_id?: string }[]).filter((r) => r.product_id === id) : data);
    }
    throw new Error(`unexpected fetch ${url.href}`);
  }) as typeof fetch;
  return {
    queries,
    restore() {
      globalThis.fetch = saved.fetch;
      for (const key of Object.keys(process.env)) if (!(key in saved.env)) delete process.env[key];
      Object.assign(process.env, saved.env);
    },
  };
}

const request = (pathAndQuery: string, host = 'dar-alfath-client.vercel.app') => new Request(`https://${host}${pathAndQuery}`);
const meta = (html: string, attr: 'name' | 'property', key: string) => new RegExp(`<meta[^>]*?${attr}="${key}"[^>]*?content="([^"]*)"`).exec(html)?.[1];
const jsonLd = (html: string): Record<string, unknown>[] =>
  [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test('كتاب: عنوان ووصف وصورة مصغّرة ورابط أساسي وبيانات منظمة، وكلها في الـ HTML نفسه', async () => {
  const world = mockWorld({ products_public_catalog: [BOOK, { ...BOOK, country_code: 'SA', min_price: 40 }], product_variants_public: [{ product_id: ID, is_available: true, country_code: 'EG' }] });
  try {
    const response = await pageHandler(request(`/api/page?kind=book&id=${ID}`));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage');

    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain(`<title>${BOOK.title} — دار الفتح للنشر والتوزيع</title>`);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(meta(html, 'name', 'description')).toContain('هذا الإصدار مصمم بعناية');
    expect(meta(html, 'name', 'description')!.length).toBeLessThanOrEqual(160);
    expect(meta(html, 'property', 'og:title')).toBe(`${BOOK.title} — دار الفتح للنشر والتوزيع`);
    expect(meta(html, 'property', 'og:type')).toBe('book');
    expect(meta(html, 'property', 'og:url')).toBe(`https://dar-alfath-client.vercel.app/book/${ID}`);
    // A cover is a megabyte or more: the preview asks storage for a small one.
    expect(meta(html, 'property', 'og:image')).toBe(`${SUPABASE}/storage/v1/render/image/public/book-covers/abc.jpg?width=600&amp;height=600&amp;resize=contain&amp;quality=75`);
    expect(html).toContain(`<link data-seo="1" rel="canonical" href="https://dar-alfath-client.vercel.app/book/${ID}" />`);
    expect(meta(html, 'name', 'robots')).toContain('index');

    const [product, crumbs] = jsonLd(html) as [Record<string, any>, Record<string, any>];
    expect(product['@type']).toEqual(['Product', 'Book']);
    expect(product.name).toBe(BOOK.title);
    expect(product.author).toEqual({ '@type': 'Person', name: BOOK.author });
    expect(product.isbn).toBe(BOOK.isbn);
    // Prices differ by country: the home market's row is the one used.
    expect(product.offers).toMatchObject({ '@type': 'Offer', price: 35, priceCurrency: 'EGP', availability: 'https://schema.org/InStock' });
    expect(crumbs.itemListElement.map((i: any) => i.name)).toEqual(['الرئيسية', 'الكتب', 'منهج الدورة الصيفية', BOOK.title]);
  } finally {
    world.restore();
  }
});

test('كتاب: مخزون خالص بيتقال في البيانات المنظمة، ومفيش ادعاء لو مش معروف', async () => {
  let world = mockWorld({ products_public_catalog: [BOOK], product_variants_public: [{ product_id: ID, is_available: false, country_code: 'EG' }] });
  try {
    const out = jsonLd(await (await pageHandler(request(`/api/page?kind=book&id=${ID}`))).text())[0] as any;
    expect(out.offers.availability).toBe('https://schema.org/OutOfStock');
  } finally {
    world.restore();
  }
  world = mockWorld({ products_public_catalog: [BOOK], product_variants_public: 'fail' });
  try {
    const out = jsonLd(await (await pageHandler(request(`/api/page?kind=book&id=${ID}`))).text())[0] as any;
    expect(out.offers.availability).toBeUndefined();
  } finally {
    world.restore();
  }
});

test('أمان: عنوان فيه علامات HTML وسكريبت ما يقدرش يطلع من الـ head', async () => {
  const evil = { ...BOOK, title: 'x"><script>alert(1)</script> & <b>y</b>', description: '</script><img src=x onerror=alert(2)>' };
  const world = mockWorld({ products_public_catalog: [evil], product_variants_public: [] });
  try {
    const html = await (await pageHandler(request(`/api/page?kind=book&id=${ID}`))).text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('x&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;y&lt;/b&gt;');
    // Still parseable JSON, and nothing in it can close its own tag.
    const ld = jsonLd(html);
    expect(ld).toHaveLength(2);
    expect(JSON.stringify(ld)).toContain('<script>alert(1)</script>');
    expect(html.split('<script data-seo="1" type="application/ld+json">').slice(1).every((part) => !part.split('</script>')[0].includes('<'))).toBe(true);
  } finally {
    world.restore();
  }
});

test('كتاب مش موجود: 404 وnoindex، وid غلط كمان، وقاعدة البيانات واقفة بيرجّع الصفحة العادية', async () => {
  let world = mockWorld({ products_public_catalog: [BOOK], product_variants_public: [] });
  try {
    for (const id of [OTHER_ID, 'not-a-uuid', "1' or '1'='1"]) {
      const response = await pageHandler(request(`/api/page?kind=book&id=${encodeURIComponent(id)}`));
      expect(response.status, id).toBe(404);
      expect(response.headers.get('x-robots-tag')).toBe('noindex');
      expect(meta(await response.text(), 'name', 'robots')).toContain('noindex');
    }
  } finally {
    world.restore();
  }

  world = mockWorld({ products_public_catalog: 'fail', product_variants_public: 'fail' });
  try {
    const response = await pageHandler(request(`/api/page?kind=book&id=${ID}`));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(INDEX_HTML); // exactly the app's own page: nothing is held up by the database
  } finally {
    world.restore();
  }
});

test('تصنيف وسلسلة والبحث: عنوان التصنيف، ورابطه الأساسي، والبحث noindex', async () => {
  const world = mockWorld({ categories: [{ name: 'سلسلة النحو بين يديك', slug: 'سلسلة-النحو-بين-يديك' }] });
  try {
    const slug = 'سلسلة-النحو-بين-يديك';
    let html = await (await pageHandler(request(`/api/page?kind=books&category=${encodeURIComponent(slug)}`))).text();
    expect(html).toContain('<title>سلسلة النحو بين يديك — دار الفتح للنشر والتوزيع</title>');
    expect(meta(html, 'property', 'og:url')).toBe(`https://dar-alfath-client.vercel.app/books?category=${encodeURIComponent(slug)}`);
    expect(meta(html, 'name', 'robots')).toContain('index');

    html = await (await pageHandler(request(`/api/page?kind=books&category=${encodeURIComponent(slug)}&sort=price-asc`))).text();
    expect(meta(html, 'name', 'robots')).toContain('noindex');
    html = await (await pageHandler(request('/api/page?kind=books&q=%D9%86%D8%AD%D9%88'))).text();
    expect(meta(html, 'name', 'robots')).toContain('noindex');
    expect(html).toContain('<title>كل الكتب — دار الفتح للنشر والتوزيع</title>');

    // A value that isn't a plain slug never reaches the database query.
    world.queries.length = 0;
    await pageHandler(request(`/api/page?kind=books&category=${encodeURIComponent('x&select=*')}`));
    expect(world.queries.filter((q) => q.startsWith('/rest/v1/categories'))).toHaveLength(0);
  } finally {
    world.restore();
  }
});

test('الصفحات الأساسية: لكل صفحة عنوان ووصف ورابط', async () => {
  const world = mockWorld({});
  try {
    for (const [kind, title, canonicalPath] of [['about', 'عن الدار', '/about'], ['contact', 'تواصل معنا', '/contact'], ['policies', 'سياسة المتجر', '/policies'], ['categories', 'التصنيفات', '/categories']] as const) {
      const html = await (await pageHandler(request(`/api/page?kind=${kind}`))).text();
      expect(html, kind).toContain(`<title>${title} — دار الفتح للنشر والتوزيع</title>`);
      expect(meta(html, 'property', 'og:url'), kind).toBe(`https://dar-alfath-client.vercel.app${canonicalPath}`);
      expect(meta(html, 'name', 'description')!.length, kind).toBeGreaterThan(40);
    }
  } finally {
    world.restore();
  }
});

test('الدومين: الرابط الأساسي هو دومين الإنتاج حتى لو الطلب جه على vercel.app، وبيتغير بإعداد واحد', async () => {
  let world = mockWorld({ products_public_catalog: [BOOK], product_variants_public: [] }, { VERCEL_PROJECT_PRODUCTION_URL: 'darolfath.com' });
  try {
    const html = await (await pageHandler(request(`/api/page?kind=book&id=${ID}`))).text();
    expect(meta(html, 'property', 'og:url')).toBe(`https://darolfath.com/book/${ID}`);
    expect(html).toContain(`href="https://darolfath.com/book/${ID}"`);
  } finally {
    world.restore();
  }
  world = mockWorld({ products_public_catalog: [BOOK], product_variants_public: [] }, { VERCEL_PROJECT_PRODUCTION_URL: 'darolfath.com', VITE_SITE_URL: 'https://www.darolfath.com/' });
  try {
    const html = await (await pageHandler(request(`/api/page?kind=book&id=${ID}`))).text();
    expect(meta(html, 'property', 'og:url')).toBe(`https://www.darolfath.com/book/${ID}`);
  } finally {
    world.restore();
  }
});

test('sitemap.xml: الصفحات الأساسية والتصنيفات وكل كتاب مرة واحدة', async () => {
  const world = mockWorld({
    products_public_catalog: [
      { product_id: ID, created_at: '2026-10-03T10:00:00Z' },
      { product_id: ID, created_at: '2026-10-03T10:00:00Z' }, // the same book in another country
      { product_id: OTHER_ID, created_at: null },
    ],
    categories: [{ slug: 'كتب-المعلم' }, { slug: null }],
  });
  try {
    const response = await sitemapHandler(request('/sitemap.xml', 'darolfath.com'));
    const xml = await response.text();
    expect(response.headers.get('content-type')).toContain('xml');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain('https://darolfath.com/');
    expect(locs).toContain('https://darolfath.com/books');
    expect(locs).toContain(`https://darolfath.com/books?category=${encodeURIComponent('كتب-المعلم')}`);
    expect(locs.filter((l) => l.endsWith(`/book/${ID}`))).toHaveLength(1);
    expect(locs).toContain(`https://darolfath.com/book/${OTHER_ID}`);
    expect(xml).toContain('<lastmod>2026-10-03</lastmod>');
    expect(xml).not.toContain('/cart');
    expect(xml.startsWith('<?xml')).toBe(true);
  } finally {
    world.restore();
  }
});

test('robots.txt: مقفول على vercel.app ومفتوح (مع الـ sitemap) على دومين حقيقي', async () => {
  const world = mockWorld({}, { VERCEL_PROJECT_PRODUCTION_URL: 'darolfath.com' });
  try {
    expect(await robotsHandler(request('/robots.txt', 'dar-alfath-client.vercel.app')).text()).toBe('User-agent: *\nDisallow: /\n');
    const open = await robotsHandler(request('/robots.txt', 'darolfath.com')).text();
    expect(open).toContain('Allow: /');
    expect(open).toContain('Sitemap: https://darolfath.com/sitemap.xml');
    expect(open).not.toContain('Disallow: /\n');
  } finally {
    world.restore();
  }
});

test('أدوات: اختصار الوصف، والصورة المصغّرة، وJSON آمن', () => {
  expect(shorten('كلمة '.repeat(100)).length).toBeLessThanOrEqual(156);
  expect(shorten('  قصير   وواضح  ')).toBe('قصير وواضح');
  expect(shorten(null)).toBe('');
  expect(previewImage(`${SUPABASE}/storage/v1/object/public/book-covers/a b.jpg?v=3`, 'https://x.com')).toBe(`${SUPABASE}/storage/v1/render/image/public/book-covers/a b.jpg?width=600&height=600&resize=contain&quality=75`);
  expect(previewImage('https://cdn.example.com/a.png', 'https://x.com')).toBe('https://cdn.example.com/a.png');
  expect(previewImage(null, 'https://x.com')).toBe('https://x.com/branding/dar-alfath-logo.jpeg');
  expect(jsonLdText({ a: '</script><!--' })).not.toMatch(/[<>]/);
});

test('الصفحة المبنية فيها tags الرئيسية أصلًا: الدالة بتستبدلها من غير تكرار', () => {
  // What the build produces for the home page, then what the function makes of it for a book.
  const built = injectSeo(INDEX_HTML, staticSeo('home', 'https://darolfath.com'), 'https://darolfath.com');
  expect(built.match(/data-seo="1"/g)!.length).toBeGreaterThan(10);
  const html = injectSeo(built, bookSeo({ id: ID, title: BOOK.title, author: BOOK.author, coverUrl: BOOK.cover_url, minPrice: 35, currency: 'EGP' }, 'https://darolfath.com'), 'https://darolfath.com');
  expect(html.match(/<title>/g)).toHaveLength(1);
  for (const tag of ['name="description"', 'name="robots"', 'rel="canonical"', 'property="og:title"', 'property="og:image"', 'property="og:url"', 'name="twitter:card"']) {
    expect(html.split(tag), tag).toHaveLength(2); // exactly one of each
  }
  expect(jsonLd(html).map((d) => (Array.isArray(d['@type']) ? 'Product' : d['@type']))).toEqual(['Product', 'BreadcrumbList']); // the home page's two are gone
  expect(meta(html, 'property', 'og:url')).toBe(`https://darolfath.com/book/${ID}`);
});

test('لو اللي رجع مش صفحة الموقع (صفحة دخول قدام نسخة محمية): بيتبعت زي ما هو من غير ما نكتب فيه، والكوكيز بتتمرر', async () => {
  const world = mockWorld({ products_public_catalog: [BOOK], product_variants_public: [] });
  const seen: (string | null)[] = [];
  const inner = globalThis.fetch;
  const LOGIN = '<!doctype html><html><head><title>Log in to Vercel</title></head><body>login</body></html>';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === '/index.html') {
      const cookie = new Headers(init?.headers).get('cookie');
      seen.push(cookie);
      return new Response(cookie === '_vercel_jwt=abc' ? INDEX_HTML : LOGIN);
    }
    return inner(input, init);
  }) as typeof fetch;
  try {
    // Without the cookie the protected deployment answers with its login page: passed on as it is.
    let html = await (await pageHandler(request(`/api/page?kind=book&id=${ID}`))).text();
    expect(html).toBe(LOGIN);
    // With it, the app's page comes back and gets the book's tags.
    html = await (await pageHandler(new Request(`https://dar-alfath-client.vercel.app/api/page?kind=book&id=${ID}`, { headers: { cookie: '_vercel_jwt=abc' } }))).text();
    expect(html).toContain(`<title>${BOOK.title} — دار الفتح للنشر والتوزيع</title>`);
    expect(seen).toEqual([null, '_vercel_jwt=abc']);
  } finally {
    world.restore();
  }
});
