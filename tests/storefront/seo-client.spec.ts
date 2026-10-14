import { test, expect, type Page } from '../fixtures';

// The app keeps the page's title, description, preview and structured data current as the visitor
// moves around (the edge functions send the same tags in the HTML; this is the in-app half).
// Real books are read; nothing is written.

interface Head { title: string; description: string | null; robots: string | null; canonical: string | null; ogTitle: string | null; ogImage: string | null; ld: Record<string, unknown>[] }

const head = (page: Page): Promise<Head> =>
  page.evaluate(() => {
    const content = (selector: string) => document.head.querySelector(selector)?.getAttribute('content') ?? null;
    return {
      title: document.title,
      description: content('meta[name="description"]'),
      robots: content('meta[name="robots"]'),
      canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      ogTitle: content('meta[property="og:title"]'),
      ogImage: content('meta[property="og:image"]'),
      ld: [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? '{}')),
    };
  });

async function aBook(page: Page): Promise<{ id: string; title: string; categorySlug: string | null; categoryName: string | null }> {
  await page.goto('/');
  return page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const { data } = await supabase.from('products_public_catalog').select('product_id, title, category_slug, category_name, cover_url').not('cover_url', 'is', null).limit(30);
    const row = ((data ?? []) as { product_id: string; title: string; category_slug: string | null; category_name: string | null }[]).find((r) => r.category_slug) ?? (data as any)[0];
    return { id: row.product_id, title: row.title.replace(/\s+/g, ' ').trim(), categorySlug: row.category_slug, categoryName: row.category_name?.trim() ?? null };
  });
}

test('الرئيسية: عنوان ووصف وبيانات الدار وصندوق البحث', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await head(page)).ld.length).toBeGreaterThan(0);
  const h = await head(page);
  expect(h.title).toContain('دار الفتح للنشر والتوزيع');
  expect(h.description!.length).toBeGreaterThan(40);
  expect(h.robots).toContain('index');
  expect(h.canonical).toBe(`${new URL(page.url()).origin}/`);
  const types = h.ld.map((d) => d['@type']);
  expect(types).toEqual(['Organization', 'WebSite']);
  expect((h.ld[1] as any).potentialAction.target.urlTemplate).toBe(`${new URL(page.url()).origin}/books?q={search_term_string}`);
});

test('صفحة الكتاب: كل بياناتها بتظهر، وتتغير لما تروح لصفحة تانية', async ({ page }) => {
  const book = await aBook(page);
  await page.goto(`/book/${book.id}`);
  await expect.poll(async () => (await head(page)).title, { timeout: 20_000 }).toContain(book.title);

  const h = await head(page);
  expect(h.title).toBe(`${book.title} — دار الفتح للنشر والتوزيع`);
  expect(h.description!.length).toBeGreaterThan(30);
  expect(h.canonical).toBe(`${new URL(page.url()).origin}/book/${book.id}`);
  expect(h.ogTitle).toBe(h.title);
  expect(h.ogImage).toMatch(/width=600/);                     // a small version of the cover for previews
  expect(h.robots).toContain('index');
  const product = h.ld.find((d) => Array.isArray(d['@type']) && (d['@type'] as string[]).includes('Product')) as any;
  expect(product.name).toBe(book.title);
  expect(product.offers.priceCurrency).toMatch(/^[A-Z]{3}$/);
  expect(product.offers.availability).toMatch(/schema\.org\/(InStock|OutOfStock)/);
  expect(h.ld.some((d) => d['@type'] === 'BreadcrumbList')).toBe(true);

  // Leaving the page lets go of its tags: the cart is a private page.
  await page.goto('/cart');
  await expect.poll(async () => (await head(page)).robots).toContain('noindex');
  expect((await head(page)).title).toContain('سلة المشتريات');
  expect((await head(page)).ld).toHaveLength(0);
});

test('صفحة تصنيف: عنوان التصنيف، والبحث والترتيب noindex، والصفحة الغلط noindex', async ({ page }) => {
  const book = await aBook(page);
  test.skip(!book.categorySlug || !book.categoryName, 'مفيش كتاب له تصنيف');

  await page.goto(`/books?category=${encodeURIComponent(book.categorySlug!)}`);
  await expect.poll(async () => (await head(page)).title, { timeout: 20_000 }).toContain(book.categoryName!);
  let h = await head(page);
  expect(h.canonical).toContain(`/books?category=${encodeURIComponent(book.categorySlug!)}`);
  expect(h.robots).toContain('index');

  await page.goto('/books?q=%D9%83%D8%AA%D8%A7%D8%A8');
  await expect.poll(async () => (await head(page)).robots).toContain('noindex');
  await page.goto('/books');
  await expect.poll(async () => (await head(page)).robots).toContain('index');
  await page.goto('/books?sort=price-asc');
  await expect.poll(async () => (await head(page)).robots).toContain('noindex');

  await page.goto('/no-such-page');
  await expect.poll(async () => (await head(page)).robots).toContain('noindex');
  h = await head(page);
  expect(h.title).toContain('الصفحة غير موجودة');
});

test('الصفحات الثابتة: لكل واحدة عنوان ووصف خاص بيها', async ({ page }) => {
  for (const [path, word] of [['/about', 'عن الدار'], ['/contact', 'تواصل معنا'], ['/policies', 'سياسة المتجر'], ['/categories', 'التصنيفات']] as const) {
    await page.goto(path);
    await expect.poll(async () => (await head(page)).title, { message: path }).toContain(word);
    const h = await head(page);
    expect(h.canonical, path).toBe(`${new URL(page.url()).origin}${path}`);
    expect(h.robots, path).toContain('index');
  }
});
