import { test, expect, type Page, type Route } from '../fixtures';

// The books page's filters (category, series, author, type, price, available only, offers only), the order,
// the active chips and "clear", and the home page's "وصل حديثًا" / "عروض وخصومات" rows. Real books are
// read; where a case needs a particular situation (some books on offer, some out of stock) the catalog
// response is rewritten in flight — nothing is written anywhere.

interface Row {
  product_id: string;
  title: string;
  author: string | null;
  type: string | null;
  min_price: number;
  max_price: number;
  max_discount_pct: number | null;
  created_at: string | null;
  category_slug: string | null;
}

const cards = (page: Page) => page.locator('.books-grid--catalog article.book-card');
const countText = (page: Page) => page.getByText(/\d+ كتاب مطابق/).first();
const shownCount = async (page: Page) => Number(/(\d+) كتاب مطابق/.exec((await countText(page).textContent()) ?? '')?.[1]);
const titles = (page: Page) => cards(page).evaluateAll((els) => els.map((el) => (el.getAttribute('aria-label') ?? '').replace(/^فتح صفحة\s*/, '').trim()));

/** Opens a page and returns the catalog rows it was given (the ones the filters work on). */
async function openWithRows(page: Page, path: string, rewrite?: (rows: Row[]) => Row[], variants?: (rows: { product_id: string; is_available: boolean }[]) => { product_id: string; is_available: boolean }[]) {
  const onHome = path === '/';
  let rows: Row[] = [];
  await page.route('**/rest/v1/products_public_catalog*', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const json = (await response.json()) as Row[];
    rows = rewrite ? rewrite(json) : json;
    return route.fulfill({ response, json: rows });
  });
  if (variants) {
    await page.route('**/rest/v1/product_variants_public*', async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      return route.fulfill({ response, json: variants((await response.json()) as { product_id: string; is_available: boolean }[]) });
    });
  }
  await page.goto(path);
  await expect(onHome ? page.getByTestId('new-arrivals') : cards(page).first().or(page.getByText('لا توجد نتائج'))).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  return rows;
}

/** The panel is closed until asked for (on every screen): open it before using its fields. */
async function openFilters(page: Page) {
  const button = page.locator('.catalog-filters__toggle');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(page.locator('.catalog-filters__panel')).toBeVisible();
}

/** The on/off chips are checkboxes laid under their label: click the checkbox itself. */
const toggle = (page: Page, name: string) => page.getByLabel(name, { exact: true }).evaluate((el) => (el as HTMLInputElement).click());

const norm = (s: string) => s.replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه').replace(/^د\s*\/?\s*/, '').replace(/\s+/g, ' ').trim();

test('منطق التصفية: المؤلف بإملاءين، والتحويل من العنوان، والسعر، والترتيب', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const f = await import('/src/lib/catalogFilters.ts');
    const book = (over: Record<string, unknown>) => {
      const b = { product_id: String(Math.random()), id: 'x', title: 'ب', author: 'a', type: 'ورقي', min_price: 50, max_price: 100, discount_percent: null, rating: null, created_at: '2026-01-01', category_slug: 'c', ...over } as any;
      return { ...b, starting_price: b.min_price };
    };
    const rows = [
      book({ product_id: 'a', title: 'أ', author: 'د / أيمن أمين عبدالغني', min_price: 10, max_price: 10, created_at: '2026-03-01' }),
      book({ product_id: 'b', title: 'ب', author: 'د / أيمن أمين عبدالغني', min_price: 30, max_price: 90, discount_percent: 20, created_at: '2026-01-01' }),
      book({ product_id: 'c', title: 'ت', author: 'أيمن أمين عبدالغنى', min_price: 200, max_price: 200, discount_percent: 5, created_at: '2026-03-01' }),
      book({ product_id: 'd', title: 'ث', author: 'عبدالرحمن بكر', min_price: 60, max_price: 60, created_at: null }),
    ];
    const base = f.parseFilters(new URLSearchParams());
    const ids = (changes: Record<string, unknown>, ctx: Record<string, unknown> = {}) => f.applyFilters(rows, { ...base, ...changes } as any, ctx as any).map((p: any) => p.product_id).join('');
    return {
      key: [f.authorKey('د / أيمن أمين عبدالغنى'), f.authorKey('أيمن أمين عبدالغني'), f.authorKey('عبدالرحمن بكر')],
      options: f.authorOptions(rows),
      parsed: f.parseFilters(new URLSearchParams('sort=bogus&min=٥٠&max=-3&available=1&sale=1&author=x')),
      parsedGood: f.parseFilters(new URLSearchParams('sort=newest&min=25.5&max=100')),
      byAuthor: ids({ author: 'ايمن امين عبدالغني' }),
      price: [ids({ min: 40, max: 100 }), ids({ min: 150 }), ids({ max: 20 }), ids({ min: 91, max: 199 })],  // overlap: b spans 30–90
      sale: ids({ saleOnly: true }),
      available: [ids({ availableOnly: true }, { availableIds: new Set(['a', 'd']) }), ids({ availableOnly: true }, { availableIds: null })],
      sorted: [ids({ sort: 'newest' }), ids({ sort: 'price-desc' }), ids({ sort: 'discount' }), ids({ sort: 'title' })],
      newest: f.newestFirst(rows).map((p: any) => p.product_id).join(''),
      active: f.activeFilterCount({ ...base, category: 'c', min: 1, availableOnly: true, q: 'x', sort: 'newest' }),
      bounds: f.priceBounds(rows),
    };
  });
  expect(r.key[0]).toBe(r.key[1]);                         // one author, two spellings, with and without "د /"
  expect(r.key[0]).not.toBe(r.key[2]);
  expect(r.options).toEqual([
    { key: r.key[0], label: 'د / أيمن أمين عبدالغني', count: 3 }, // the spelling most of their books use
    { key: r.key[2], label: 'عبدالرحمن بكر', count: 1 },
  ]);
  expect(r.parsed).toMatchObject({ sort: 'title', min: 50, max: null, availableOnly: true, saleOnly: true });   // Arabic digits read, a negative ignored
  expect(r.parsedGood).toMatchObject({ sort: 'newest', min: 25.5, max: 100 });
  expect(r.byAuthor).toBe('abc');
  // A book matches a range its cheapest-to-dearest span overlaps: b costs 30–90.
  expect(r.price).toEqual(['bd', 'c', 'a', '']);
  expect(r.sale).toBe('bc');
  expect(r.available).toEqual(['ad', 'abcd']);              // unknown stock: the filter is left out, nothing vanishes
  expect(r.sorted[0]).toBe('acbd');                         // newest first; a and c share a date: title order; no date last
  expect(r.sorted[1]).toBe('cdba');
  expect(r.sorted[2]).toBe('bcad');
  expect(r.sorted[3]).toBe('abcd');
  expect(r.newest).toBe('acbd');
  expect(r.active).toBe(3);                                  // the search words and the order are not filters
  expect(r.bounds).toEqual({ min: 10, max: 200 });
});

test('السعر: الحقول بتفلتر النتيجة، والعنوان بيتحدث من غير تكدس في سجل التصفح', async ({ page }) => {
  const rows = await openWithRows(page, '/books');
  const all = await shownCount(page);
  expect(all).toBe(rows.length);
  await openFilters(page);

  const [from, to] = [50, 150];
  await page.getByLabel('أقل سعر').fill(String(from));
  await page.getByLabel('أعلى سعر').fill(String(to));
  await expect(page).toHaveURL(/min=50/);
  await expect(page).toHaveURL(/max=150/);
  const expected = rows.filter((r) => r.max_price >= from && r.min_price <= to).length;
  expect(expected).toBeGreaterThan(0);
  expect(expected).toBeLessThan(all);
  await expect.poll(() => shownCount(page)).toBe(expected);

  // Typing didn't leave a history entry per keystroke: one back goes to where we came from.
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(3);
  await expect(page.getByTestId('filters-count')).toHaveText('1');

  // Reloading keeps it, fields included (and the panel, opened before, opens again).
  await page.reload();
  await expect(page.getByLabel('أقل سعر')).toHaveValue('50');
  await expect(page.getByLabel('أعلى سعر')).toHaveValue('150');
  await expect.poll(() => shownCount(page)).toBe(expected);

  // No book in the range: a clear message, and a way out.
  await page.getByLabel('أقل سعر').fill('900000');
  await expect(page.getByText('لا توجد نتائج')).toBeVisible();
  await page.getByRole('button', { name: 'مسح الفلاتر' }).last().click();
  await expect.poll(() => shownCount(page)).toBe(all);
});

test('المؤلف: الإملاءين بيتدمجوا في اختيار واحد، والنتيجة صح', async ({ page }) => {
  const rows = await openWithRows(page, '/books');
  const byKey = new Map<string, Row[]>();
  for (const r of rows) byKey.set(norm(r.author ?? ''), [...(byKey.get(norm(r.author ?? '')) ?? []), r]);
  const [key, group] = [...byKey.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  await openFilters(page);

  const select = page.getByLabel('المؤلف');
  const options = await select.locator('option').allTextContents();
  // One entry per author: as many as there are distinct (merged) authors, plus "all".
  expect(options).toHaveLength(byKey.size + 1);
  expect(options[1]).toContain(`(${group.length})`);

  await select.selectOption({ index: 1 });
  await expect.poll(() => shownCount(page)).toBe(group.length);
  expect(new URL(page.url()).searchParams.get('author')).toBe(key);
  await expect(page.getByRole('button', { name: /^إزالة المؤلف/ })).toBeVisible();
});

test('متاح فقط: بيخفي الكتب اللي مخزونها خلص', async ({ page }) => {
  // Three books are out of stock (all their copies unavailable).
  let outIds: string[] = [];
  const rows = await openWithRows(
    page,
    '/books',
    undefined,
    (variants) => {
      outIds = [...new Set(variants.map((v) => v.product_id))].slice(0, 3);
      return variants.map((v) => (outIds.includes(v.product_id) ? { ...v, is_available: false } : v));
    },
  );
  const all = await shownCount(page);
  expect(all).toBe(rows.length);

  await toggle(page, 'متاح فقط');
  await expect(page).toHaveURL(/available=1/);
  await expect.poll(() => shownCount(page)).toBe(all - outIds.length);
  const left = await titles(page);
  for (const id of outIds) expect(left).not.toContain(rows.find((r) => r.product_id === id)!.title.trim());

  await page.getByRole('button', { name: 'إزالة متاح فقط' }).click();
  await expect.poll(() => shownCount(page)).toBe(all);
});

test('عروض فقط والأحدث: بالضبط الكتب اللي عليها خصم، والترتيب بتاريخ الإضافة', async ({ page }) => {
  // Three books on offer (the rest at list price).
  const rows = await openWithRows(page, '/books', (r) => r.map((row, i) => ({ ...row, max_discount_pct: i < 3 ? 20 : 0 })));
  const onOffer = rows.slice(0, 3).map((r) => r.title.trim()).sort();

  await toggle(page, 'عروض فقط');
  await expect(page).toHaveURL(/sale=1/);
  await expect.poll(() => shownCount(page)).toBe(3);
  expect((await titles(page)).sort()).toEqual(onOffer);

  await page.getByRole('button', { name: 'مسح الفلاتر' }).last().click();
  await page.getByLabel('الترتيب').selectOption('newest');
  await expect(page).toHaveURL(/sort=newest/);
  const newest = [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || a.title.localeCompare(b.title, 'ar'))[0];
  await expect.poll(async () => (await titles(page))[0]).toBe(newest.title.replace(/\s+/g, ' ').trim());
});

test('الشارات: كل فلتر ليه شارة بتتشال لوحدها، ومسح الفلاتر بيشيلهم وبيسيب البحث والترتيب', async ({ page }) => {
  await openWithRows(page, '/books?q=%D9%83%D8%AA%D8%A7%D8%A8&sort=newest');
  await openFilters(page);
  await page.getByLabel('التصنيف', { exact: true }).selectOption({ index: 1 });
  await toggle(page, 'متاح فقط');
  await page.getByLabel('أقل سعر').fill('20');
  await expect(page).toHaveURL(/min=20/);

  const chips = page.locator('.catalog-filters__chip');
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toContainText('التصنيف:');
  await chips.filter({ hasText: 'السعر' }).click();
  await expect(chips).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get('min')).toBeNull();

  await page.getByRole('button', { name: 'مسح الفلاتر' }).click();
  await expect(chips).toHaveCount(0);
  const params = new URL(page.url()).searchParams;
  expect([...params.keys()].sort()).toEqual(['q', 'sort']);
});

test('الموبايل: الفلاتر مقفولة ورا زرار فيه عدد المفعّل، وبتتفتح', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWithRows(page, '/books?available=1&sale=1');
  const toggle = page.locator('.catalog-filters__toggle');
  const panel = page.locator('.catalog-filters__panel');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('filters-count')).toHaveText('2');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('التصنيف', { exact: true })).toBeVisible();
  // Still nothing sideways on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // A wide screen has the same button.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(toggle).toBeVisible();
  await expect(panel).toBeVisible();
});

test('الكمبيوتر: الفلاتر مقفولة لحد ما العميل يفتحها، والمتصفح بيفتكر اختياره، والشارات ظاهرة وهي مقفولة', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWithRows(page, '/books?sale=1');
  const toggle = page.locator('.catalog-filters__toggle');
  const panel = page.locator('.catalog-filters__panel');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  // What is on still shows, panel closed or not.
  await expect(page.getByRole('button', { name: 'إزالة عروض فقط' })).toBeVisible();
  await expect(page.getByTestId('filters-count')).toHaveText('1');

  await toggle.click();
  await expect(panel).toBeVisible();
  // From here on the real catalog is enough: reloads mustn't race the rewrite above.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.reload();
  await expect(page.locator('.catalog-filters__panel')).toBeVisible();

  await page.locator('.catalog-filters__toggle').click();
  await expect(page.locator('.catalog-filters__panel')).toBeHidden();
  await page.reload();
  await expect(page.locator('.catalog-filters__toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.catalog-filters__panel')).toBeHidden();
});

test('الرئيسية: «وصل حديثًا» بأحدث الكتب، و«عروض وخصومات» بالكتب اللي عليها خصم', async ({ page }) => {
  const rows = await openWithRows(page, '/', (r) => r.map((row, i) => ({ ...row, max_discount_pct: i < 3 ? 15 : 0 })));
  const fresh = page.getByTestId('new-arrivals');
  await expect(fresh).toBeVisible();
  await expect(fresh.locator('.shelf-rail__item')).toHaveCount(12);
  const expectedFirst = [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || a.title.localeCompare(b.title, 'ar'))[0];
  await expect(fresh.locator('article.book-card').first()).toHaveAttribute('aria-label', new RegExp(expectedFirst.title.replace(/\s+/g, '\\s+').trim().slice(0, 12)));
  await expect(fresh.getByRole('link', { name: 'عرض الكل' })).toHaveAttribute('href', '/books?sort=newest');

  const offers = page.getByTestId('offers');
  await expect(offers.locator('.shelf-rail__item')).toHaveCount(3);
  await expect(offers.getByRole('link', { name: 'عرض الكل' })).toHaveAttribute('href', '/books?sale=1&sort=discount');
  await offers.getByRole('link', { name: 'عرض الكل' }).click();
  await expect.poll(() => shownCount(page)).toBeGreaterThanOrEqual(1);
});

test('الرئيسية: صف العروض مش بيتعرض لو الخصومات أقل من 3، لكن فلتر «عروض فقط» بيشتغل', async ({ page }) => {
  await openWithRows(page, '/', (r) => r.map((row) => ({ ...row, max_discount_pct: 0 })));
  await expect(page.getByTestId('new-arrivals')).toBeVisible();
  await expect(page.getByTestId('offers')).toHaveCount(0);

  // One book on offer: a row of one would look unfinished, but the book is one click away.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await openWithRows(page, '/', (r) => r.map((row, i) => ({ ...row, max_discount_pct: i === 0 ? 10 : 0 })));
  await expect(page.getByTestId('offers')).toHaveCount(0);
  const onOffer = await openWithRows(page, '/books?sale=1', (r) => r.map((row, i) => ({ ...row, max_discount_pct: i === 0 ? 10 : 0 })));
  await expect.poll(() => shownCount(page)).toBe(1);
  expect(onOffer.length).toBeGreaterThan(1);
});
