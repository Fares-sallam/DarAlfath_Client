import { test, expect, type Page } from '../fixtures';
import { webHrefForAppLink } from '../../src/lib/homeLink';

// The home page's extra controls from the dashboard's «الصفحة الرئيسية»: a block can be scheduled (from / until), limited to some
// countries and to phones or computers, and the owner can add hand-picked shelves, rule shelves (newest / offers / e-books)
// and promo strips. Answered by the test; nothing is written.

const NOW = '2026-01-01T00:00:00Z';
const node = (over: Record<string, unknown>) => ({
  id: 'x', parent_id: null, type: 'category', name_ar: 'عنصر', name_en: null, slug: 'x',
  description_ar: null, description_en: null, image_url: null, icon: null, color: null,
  is_active: true, featured: false, show_web: true, show_app: true, sort_web: 0, sort_app: 0,
  show_in_menu_web: true, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
  books_sort_web: 'title', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null,
  intro_ar: null, intro_en: null, video_url: null, page_layout: 'auto', strips_limit: 12, show_as_strip: true,
  legacy_table: null, legacy_id: null, created_at: NOW, updated_at: NOW, ...over,
});
const NODES = [
  node({ id: 'ser', type: 'series', name_ar: 'سلسلة الاختبار', slug: 'ser' }),
  node({ id: 'nahw', parent_id: 'ser', name_ar: 'نحو', slug: 'nahw' }),
  node({ id: 'qisas', name_ar: 'قصص', slug: 'qisas', sort_web: 1 }),
];
/** book ids are real uuids (a hand-picked shelf only keeps those) */
const bid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BOOKS = Array.from({ length: 12 }, (_, i) => bid(i + 1));
const link = (product_id: string, node_id: string) => ({ product_id, node_id, is_primary: false, sort_order: 0 });
const LINKS = [...BOOKS.slice(0, 8).map((b) => link(b, 'nahw')), ...BOOKS.slice(8).map((b) => link(b, 'qisas'))];

type Row = {
  section_key: string; kind: string; node_id: string | null; title_ar: string | null; subtitle_ar: string | null; item_limit: number | null;
  visible: boolean; sort_order: number; starts_at?: string | null; ends_at?: string | null; countries?: string[] | null; devices?: string; config?: Record<string, unknown>;
};
const std = (key: string, order: number, over: Partial<Row> = {}): Row => ({ section_key: key, kind: key, node_id: null, title_ar: null, subtitle_ar: null, item_limit: null, visible: true, sort_order: order, ...over });
const promo = (id: string, order: number, over: Partial<Row> = {}): Row => ({
  section_key: `block:${id}`, kind: 'promo', node_id: null, title_ar: `إعلان ${id}`, subtitle_ar: null, item_limit: null, visible: true, sort_order: order, config: { tone: 'light' }, ...over,
});
const picked = (id: string, order: number, ids: string[], over: Partial<Row> = {}): Row => ({
  section_key: `block:${id}`, kind: 'book-shelf', node_id: null, title_ar: `مختارات ${id}`, subtitle_ar: null, item_limit: null, visible: true, sort_order: order,
  config: { product_ids: ids }, ...over,
});
const rule = (id: string, order: number, source: string, over: Partial<Row> = {}): Row => ({
  section_key: `block:${id}`, kind: 'filter-shelf', node_id: null, title_ar: `قاعدة ${id}`, subtitle_ar: null, item_limit: null, visible: true, sort_order: order,
  config: { source }, ...over,
});

async function stub(page: Page, layout: Row[], opts: { country?: 'eg' | 'sa'; digital?: string[] | 'fail' } = {}) {
  await page.addInitScript((id) => localStorage.setItem('daralfath_client_selected_country', id), opts.country ?? 'eg');
  await page.route('**/rest/v1/countries*', (route) => route.fulfill({ json: [
    { id: 'eg', name: 'مصر', code: 'EG', currency: 'EGP', currency_symbol: 'ج.م', is_active: true },
    { id: 'sa', name: 'السعودية', code: 'SA', currency: 'SAR', currency_symbol: 'ر.س', is_active: true },
  ] }));
  await page.route('**/rest/v1/home_layout*', (route) => route.fulfill({ json: layout }));
  await page.route('**/rest/v1/catalog_nodes*', (route) => route.fulfill({ json: NODES }));
  await page.route('**/rest/v1/product_nodes*', (route) => route.fulfill({ json: LINKS }));
  await page.route('**/rest/v1/home_best_sellers*', (route) => route.fulfill({ json: BOOKS.slice(0, 5).map((product_id, i) => ({ product_id, sort_order: i })) }));
  await page.route('**/rest/v1/intro_videos*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/home_feature_boxes*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/site_content_settings*', (route) => route.fulfill({ json: [{ all_books_in_bar: true, intro_videos_title: null }] }));
  await page.route('**/rest/v1/product_variants_public*', (route) => {
    if (opts.digital === 'fail') return route.fulfill({ status: 500, json: { message: 'down' } });
    const digital = new Set(opts.digital ?? []);
    return route.fulfill({
      json: BOOKS.map((product_id, i) => ({
        variant_id: `v${i}`, product_id, is_available: true, is_digital: digital.has(product_id), price: 40, country_code: 'EG', currency_symbol: 'ج.م', variant_name: 'نسخة',
      })),
    });
  });
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: BOOKS.map((product_id, i) => ({
        product_id, title: `كتاب ${String(i + 1).padStart(2, '0')}`, author: 'مؤلف', category_slug: 'nahw', category_name: 'نحو', type: 'ورقي',
        country_code: 'EG', min_price: 40, max_price: 50, starting_price: 40, max_discount_pct: i < 5 ? 20 : 0, old_price: 50, created_at: `2026-0${(i % 9) + 1}-01T00:00:00Z`, images: [],
      })),
    }));
}

const STANDARD = ['departments', 'best-sellers', 'new-arrivals', 'offers', 'categories', 'intro-videos', 'features'];
/** the standard blocks switched off, so only what a test adds is drawn (they are re-added visible if missing) */
const quiet = () => STANDARD.map((key, i) => std(key, 100 + i, { visible: false }));
const rail = (page: Page, testId: string) => page.getByTestId(testId).locator('.shelf-rail__item');

test('جدولة: اللي لسه ما بدأش واللي انتهى مبيظهرش، واللي شغال دلوقتي بيظهر', async ({ page }) => {
  await stub(page, [
    promo('future', 0, { starts_at: '2999-01-01T00:00:00Z' }),
    promo('past', 1, { ends_at: '2001-01-01T00:00:00Z' }),
    promo('running', 2, { starts_at: '2001-01-01T00:00:00Z', ends_at: '2999-01-01T00:00:00Z' }),
    promo('open', 3),
    ...quiet(),
  ]);
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: 'إعلان running' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'إعلان open' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إعلان future' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'إعلان past' })).toHaveCount(0);
});

test('بلوك قياسي (العروض) ممكن يتجدول كمان، واللي معاه مفتاح إظهار مقفول مبيظهرش حتى لو في ميعاده', async ({ page }) => {
  await stub(page, [
    ...quiet().map((r) => (r.section_key === 'best-sellers' ? { ...r, visible: true, ends_at: '2001-01-01T00:00:00Z' } : r.section_key === 'new-arrivals' ? { ...r, visible: true } : r)),
    promo('off', 0, { visible: false }),
  ]);
  await page.goto('/store');
  await expect(page.getByTestId('new-arrivals')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('best-sellers')).toHaveCount(0); // its dates ended
  await expect(page.getByRole('heading', { name: 'إعلان off' })).toHaveCount(0);
});

test('الدولة: بلوك لمصر بس بيظهر لزائر مصر ومبيظهرش لزائر السعودية، وبالعكس', async ({ page }) => {
  const layout = [promo('eg', 0, { countries: ['EG'] }), promo('sa', 1, { countries: ['SA'] }), promo('both', 2, { countries: ['EG', 'SA'] }), promo('all', 3), ...quiet()];
  await stub(page, layout, { country: 'eg' });
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: 'إعلان all' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'إعلان eg' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إعلان both' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إعلان sa' })).toHaveCount(0);
});

test('الدولة: زائر السعودية بيشوف بلوك السعودية بس', async ({ page }) => {
  const layout = [promo('eg', 0, { countries: ['EG'] }), promo('sa', 1, { countries: ['SA'] }), promo('all', 3), ...quiet()];
  await stub(page, layout, { country: 'sa' });
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: 'إعلان all' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'إعلان sa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إعلان eg' })).toHaveCount(0);
});

test('الجهاز: «الموبايل بس» بيظهر على شاشة موبايل ومبيظهرش على الكمبيوتر، و«الكمبيوتر بس» بالعكس', async ({ page }) => {
  const layout = [promo('phone', 0, { devices: 'mobile' }), promo('computer', 1, { devices: 'desktop' }), promo('any', 2), ...quiet()];
  await stub(page, layout);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: 'إعلان any' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'إعلان computer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إعلان phone' })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.getByRole('heading', { name: 'إعلان phone' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إعلان computer' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'إعلان any' })).toBeVisible();
});

test('رف كتب مختارة: الكتب بالترتيب المختار، والكتاب غير الموجود بيتخطّى، والعدد بيقصّ', async ({ page }) => {
  await stub(page, [
    picked('a', 0, [BOOKS[2], bid(999), BOOKS[0], BOOKS[1]], { title_ar: 'اخترناها لك', subtitle_ar: 'من قلب الدار' }),
    picked('cut', 1, [BOOKS[4], BOOKS[5], BOOKS[6]], { item_limit: 2 }),
    picked('nothing', 2, [bid(998)]),
    ...quiet(),
  ]);
  await page.goto('/store');
  const a = page.locator('[data-testid="custom-book-shelf"]', { has: page.getByRole('heading', { name: 'اخترناها لك' }) });
  await expect(a).toBeVisible({ timeout: 20_000 });
  await expect(a.getByText('من قلب الدار')).toBeVisible();
  await expect(a.locator('.shelf-rail__item')).toHaveCount(3);
  const titles = await a.locator('.shelf-rail__item').evaluateAll((els) => els.map((el) => (el.textContent ?? '').match(/كتاب \d\d/)?.[0]));
  expect(titles).toEqual(['كتاب 03', 'كتاب 01', 'كتاب 02']);
  const cut = page.locator('[data-testid="custom-book-shelf"]', { has: page.getByRole('heading', { name: 'مختارات cut' }) });
  await expect(cut.locator('.shelf-rail__item')).toHaveCount(2);
  // a shelf none of whose books exists is not drawn at all
  await expect(page.getByRole('heading', { name: 'مختارات nothing' })).toHaveCount(0);
});

test('رف بقاعدة: العروض (الأعلى خصم) من المتجر كله، والأحدث من تصنيف معين مع رابط له', async ({ page }) => {
  await stub(page, [
    rule('sale', 0, 'offers', { title_ar: 'خصومات الأسبوع', item_limit: 3 }),
    rule('fresh', 1, 'newest', { title_ar: 'جديد القصص', node_id: 'qisas' }),
    ...quiet(),
  ]);
  await page.goto('/store');
  const sale = page.locator('[data-testid="custom-filter-shelf"]', { has: page.getByRole('heading', { name: 'خصومات الأسبوع' }) });
  await expect(sale).toBeVisible({ timeout: 20_000 });
  await expect(sale.locator('.shelf-rail__item')).toHaveCount(3);
  await expect(sale.getByRole('link', { name: 'عرض الكل' })).toHaveAttribute('href', '/store/books?sale=1&sort=discount');

  const fresh = page.locator('[data-testid="custom-filter-shelf"]', { has: page.getByRole('heading', { name: 'جديد القصص' }) });
  await expect(fresh.locator('.shelf-rail__item')).toHaveCount(4);
  // newest first: the books of «قصص» were added in months 09, 01, 02, 03 → 09 (book 9), 03 (12), 02 (11), 01 (10)
  const titles = await fresh.locator('.shelf-rail__item').evaluateAll((els) => els.map((el) => (el.textContent ?? '').match(/كتاب \d\d/)?.[0]));
  expect(titles).toEqual(['كتاب 09', 'كتاب 12', 'كتاب 11', 'كتاب 10']);
  await expect(fresh.getByRole('link', { name: 'عرض الكل' })).toHaveAttribute('href', '/store/books?category=qisas'); // a category with an address name keeps the address it always had
});

test('رف بقاعدة: التصنيف المحذوف لا يوسّع الرف إلى كل كتب المتجر', async ({ page }) => {
  await stub(page, [
    rule('missing', 0, 'newest', { title_ar: 'رف بنطاق محذوف', node_id: 'deleted' }),
    rule('whole', 1, 'newest', { title_ar: 'رف المتجر كله' }),
    ...quiet(),
  ]);
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: 'رف المتجر كله' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'رف بنطاق محذوف' })).toHaveCount(0);
});

test('رف الكتب الإلكترونية: بالكتب اللي ليها نسخة رقمية بس، ومن غير رابط «عرض الكل»', async ({ page }) => {
  await stub(page, [rule('ebooks', 0, 'ebooks', { title_ar: 'مكتبتك الرقمية' }), ...quiet()], { digital: [BOOKS[1], BOOKS[3]] });
  await page.goto('/store');
  const shelf = page.getByTestId('custom-filter-shelf');
  await expect(shelf).toBeVisible({ timeout: 20_000 });
  await expect(shelf.locator('.shelf-rail__item')).toHaveCount(2);
  await expect(shelf.getByRole('link', { name: 'عرض الكل' })).toHaveCount(0);
});

test('رف الكتب الإلكترونية: لو نسخ الكتب مش مقروءة مبيترسمش (مبنخمّنش)', async ({ page }) => {
  await stub(page, [rule('ebooks', 0, 'ebooks', { title_ar: 'مكتبتك الرقمية' }), picked('p', 1, [BOOKS[0]]), ...quiet()], { digital: 'fail' });
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: 'مختارات p' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'مكتبتك الرقمية' })).toHaveCount(0);
});

test('شريط الإعلان: عنوان ونص وصورة وزر، واللون في الكلاس، والزر بيفتح صفحة الموقع المقابلة', async ({ page }) => {
  await stub(page, [
    promo('main', 0, {
      title_ar: 'خصم الشتاء', subtitle_ar: 'على كل كتب النحو',
      config: { tone: 'brand', image_url: 'https://example.com/a.png', link_url: '/search?sort=newest', button_label: 'تصفح الآن' },
    }),
    ...quiet(),
  ]);
  await page.goto('/store');
  const block = page.getByTestId('home-promo');
  await expect(block).toBeVisible({ timeout: 20_000 });
  await expect(block).toHaveAttribute('data-tone', 'brand');
  await expect(block.getByRole('heading', { name: 'خصم الشتاء' })).toBeVisible();
  await expect(block.getByText('على كل كتب النحو')).toBeVisible();
  await expect(block.locator('img.home-promo__image')).toHaveAttribute('src', 'https://example.com/a.png');
  await expect(block.getByRole('link', { name: 'تصفح الآن' })).toHaveAttribute('href', '/store/books?sort=newest');
});

test('شريط الإعلان: رابط ملوش مقابل في الموقع (المكتبة الإلكترونية) = من غير زر، وصورة بس + رابط = الشريط كله بيفتح', async ({ page }) => {
  await stub(page, [
    promo('nolink', 0, { config: { tone: 'light', link_url: '/ebooks', button_label: 'افتح' } }),
    promo('imageonly', 1, { title_ar: null, config: { tone: 'light', image_url: 'https://example.com/b.png', link_url: '/search?series=ser&title=x' } }),
    ...quiet(),
  ]);
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: 'إعلان nolink' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('home-promo').first().getByRole('link')).toHaveCount(0);
  const imageOnly = page.getByTestId('home-promo').nth(1);
  await expect(imageOnly.locator('a.home-promo__cover')).toHaveAttribute('href', '/store/books?series=ser');
});

test('الترتيب المحفوظ: البلوكات المضافة بين القياسية في مكانها بالظبط', async ({ page }) => {
  await stub(page, [
    std('best-sellers', 0), promo('mid', 1), picked('shelf', 2, [BOOKS[0]]), std('new-arrivals', 3),
    ...STANDARD.filter((k) => k !== 'best-sellers' && k !== 'new-arrivals').map((key, i) => std(key, 10 + i, { visible: false })),
  ]);
  await page.goto('/store');
  await expect(page.getByTestId('new-arrivals')).toBeVisible({ timeout: 20_000 });
  const order = await page.locator('.page-sections--home > [data-testid]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(order).toEqual(['best-sellers', 'custom-promo', 'custom-book-shelf', 'new-arrivals']);
});

test('صف من نوع مش معروف أو بإعدادات بايظة مبيكسرش الصفحة', async ({ page }) => {
  await stub(page, [
    { ...promo('x', 0), kind: 'mystery' },
    picked('bad', 1, [], { config: { product_ids: 'not-a-list' } as any }),
    rule('weird', 2, 'bogus'), // an unknown rule counts as «newest»
    ...quiet(),
  ]);
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: 'قاعدة weird' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'إعلان x' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'مختارات bad' })).toHaveCount(0);
});

test('رابط الإعلان: بيتحوّل من عنوان التطبيق لصفحة الموقع، والغريب بيتشال', async () => {
  const nodes = [{ id: 'ser', type: 'series' as const, name_ar: 'سلسلة' }, { id: 'c1', type: 'category' as const, name_ar: ' نحو ' }];
  expect(webHrefForAppLink('/', nodes)).toBe('/');
  expect(webHrefForAppLink('/search', nodes)).toBe('/books');
  expect(webHrefForAppLink('/search?sort=newest', nodes)).toBe('/books?sort=newest');
  expect(webHrefForAppLink('/orders', nodes)).toBe('/account/orders');
  expect(webHrefForAppLink('/ebooks', nodes)).toBeNull();
  expect(webHrefForAppLink('/book/abc-123', nodes)).toBe('/book/abc-123');
  expect(webHrefForAppLink('/search?series=ser&title=%D8%B3', nodes)).toBe('/books?series=ser');
  expect(webHrefForAppLink('/search?category=%D9%86%D8%AD%D9%88', nodes)).toBe('/books?node=c1');
  expect(webHrefForAppLink('/search?category=غير-موجود', nodes)).toBeNull();
  expect(webHrefForAppLink('/search?type=digital', nodes)).toBeNull();
  expect(webHrefForAppLink('//evil.example', nodes)).toBeNull();
  expect(webHrefForAppLink('https://evil.example', nodes)).toBeNull();
  expect(webHrefForAppLink('javascript:alert(1)', nodes)).toBeNull();
  expect(webHrefForAppLink('', nodes)).toBeNull();
  expect(webHrefForAppLink(null, nodes)).toBeNull();
});
