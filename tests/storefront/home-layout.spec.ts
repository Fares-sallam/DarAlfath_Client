import { test, expect, type Page } from '../fixtures';

// The home page as the dashboard's «الصفحة الرئيسية» lays it out: the standard blocks and the category shelves in ONE order,
// each shown or hidden, with its own title, line and book count; and the «كتب قد تعجبك» strip on a book's page. Answered by the
// test; nothing is written.

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
  node({ id: 'ser', type: 'series', name_ar: 'سلسلة الاختبار', slug: 'ser', sort_web: 0 }),
  node({ id: 'nahw', parent_id: 'ser', name_ar: 'نحو', slug: 'nahw', sort_web: 0 }),
  node({ id: 'qisas', name_ar: 'قصص', slug: 'qisas', sort_web: 1 }),
];
const link = (product_id: string, node_id: string) => ({ product_id, node_id, is_primary: false, sort_order: 0 });
const BOOKS = Array.from({ length: 12 }, (_, i) => `b${i + 1}`);
const LINKS = [...BOOKS.slice(0, 8).flatMap((b) => [link(b, 'nahw'), link(b, 'ser')]), ...BOOKS.slice(8).map((b) => link(b, 'qisas'))];

type Row = { section_key: string; kind: string; node_id: string | null; title_ar: string | null; subtitle_ar: string | null; item_limit: number | null; visible: boolean; sort_order: number };
const std = (key: string, order: number, over: Partial<Row> = {}): Row => ({ section_key: key, kind: key, node_id: null, title_ar: null, subtitle_ar: null, item_limit: null, visible: true, sort_order: order, ...over });
const shelf = (id: string, order: number, over: Partial<Row> = {}): Row => ({ section_key: `shelf:${id}`, kind: 'category-shelf', node_id: id, title_ar: null, subtitle_ar: null, item_limit: null, visible: true, sort_order: order, ...over });
const strip = (over: Partial<Row> = {}): Row => ({ section_key: 'page:book-related', kind: 'page-strip', node_id: null, title_ar: null, subtitle_ar: null, item_limit: null, visible: true, sort_order: 0, ...over });

async function stub(page: Page, layout: Row[]) {
  await page.route('**/rest/v1/home_layout*', (route) => route.fulfill({ json: layout }));
  await page.route('**/rest/v1/catalog_nodes*', (route) => route.fulfill({ json: NODES }));
  await page.route('**/rest/v1/product_nodes*', (route) => route.fulfill({ json: LINKS }));
  await page.route('**/rest/v1/home_best_sellers*', (route) => route.fulfill({ json: BOOKS.slice(0, 5).map((product_id, i) => ({ product_id, sort_order: i })) }));
  await page.route('**/rest/v1/intro_videos*', (route) => route.fulfill({ json: [{ id: 'v1', title: 'فيديو 1', description: null, youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk', duration: null, sort_order: 0 }] }));
  await page.route('**/rest/v1/home_feature_boxes*', (route) => route.fulfill({ json: [{ id: 'f1', title: 'ميزة', description: 'وصف', icon_key: 'truck', image_url: null }] }));
  await page.route('**/rest/v1/site_content_settings*', (route) => route.fulfill({ json: [{ all_books_in_bar: true, intro_videos_title: 'فيديوهات الدار' }] }));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: BOOKS.map((product_id, i) => ({
        product_id, title: `كتاب ${String(i + 1).padStart(2, '0')}`, author: 'مؤلف', category_slug: 'nahw', category_name: 'نحو', type: 'ورقي',
        country_code: 'EG', min_price: 40, max_price: 50, starting_price: 40, max_discount_pct: i < 5 ? 20 : 0, old_price: 50, created_at: `2026-0${(i % 9) + 1}-01T00:00:00Z`, images: [],
      })),
    }));
}

const STANDARD = ['departments', 'best-sellers', 'new-arrivals', 'offers', 'categories', 'intro-videos', 'features'];
const seed = (over: Record<string, Partial<Row>> = {}) => STANDARD.map((key, i) => std(key, i, over[key] ?? {}));
/** What each block draws on the page, top to bottom (the heading of a block; the boxes above the footer have none). */
const headings = (page: Page) =>
  page.locator('.page-sections--home .section-heading h2, .page-sections--home [data-testid="feature-boxes"]').evaluateAll((els) =>
    els.map((el) => (el.tagName === 'H2' ? el.textContent!.trim() : 'FEATURES')));

test('الترتيب المحفوظ: الأقسام والرفوف بترتيب واحد، والمخفي مبيظهرش، والرف بين الأقسام مكانه', async ({ page }) => {
  await stub(page, [
    std('best-sellers', 0), std('departments', 1), shelf('qisas', 2, { title_ar: 'قصص للصغار', item_limit: 3 }), std('offers', 3),
    std('new-arrivals', 4, { visible: false }), std('categories', 5), std('intro-videos', 6), std('features', 7, { visible: false }),
  ]);
  await page.goto('/');
  await expect(page.locator('.shelf-section').first()).toBeVisible({ timeout: 20_000 });
  const list = await headings(page);
  expect(list.slice(0, 4)).toEqual(['الأكثر مبيعًا', 'أقسام المتجر', 'قصص للصغار', 'عروض وخصومات']);
  expect(list).not.toContain('وصل حديثًا');
  expect(list).not.toContain('FEATURES');
  // the shelf holds its three books; the automatic «first categories» block stepped aside (no shelf of «نحو» appears)
  await expect(page.locator('.shelf-section', { has: page.getByRole('heading', { name: 'قصص للصغار' }) }).locator('.shelf-rail__item')).toHaveCount(3);
  expect(list).not.toContain('نحو');
});

test('عنوان وسطر وعدد لكل بلوك: «وصل حديثًا» بعنوانه الجديد وأول ٤ كتب، «الأكثر مبيعًا» بأول ٢، السلاسل بعنوان جديد', async ({ page }) => {
  await stub(page, seed({
    departments: { title_ar: 'أقسامنا' },
    'best-sellers': { title_ar: 'الأكثر طلبًا', subtitle_ar: 'اختيارنا', item_limit: 2 },
    'new-arrivals': { title_ar: 'جديدنا', subtitle_ar: 'وصلت حديثًا', item_limit: 4 },
    'intro-videos': { title_ar: 'شوف واتعرّف', subtitle_ar: 'مقاطع قصيرة' },
  }));
  await page.goto('/');
  const best = page.getByTestId('best-sellers');
  await expect(best).toBeVisible({ timeout: 20_000 });
  await expect(best.getByRole('heading', { name: 'الأكثر طلبًا' })).toBeVisible();
  await expect(best.getByText('اختيارنا')).toBeVisible();
  await expect(best.locator('.shelf-rail__item')).toHaveCount(2);
  const fresh = page.getByTestId('new-arrivals');
  await expect(fresh.getByRole('heading', { name: 'جديدنا' })).toBeVisible();
  await expect(fresh.getByText('وصلت حديثًا')).toBeVisible();
  await expect(fresh.locator('.shelf-rail__item')).toHaveCount(4);
  await expect(page.locator('.store-departments').getByRole('heading', { name: 'أقسامنا' })).toBeVisible();
  const videos = page.locator('section', { has: page.getByRole('heading', { name: 'شوف واتعرّف' }) });
  await expect(videos.getByText('مقاطع قصيرة')).toBeVisible();
});

test('عنوان الفيديوهات: اللي في اللوحة، وإلا عنوان إعدادات الفيديوهات، وإلا الافتراضي', async ({ page }) => {
  await stub(page, seed());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'فيديوهات الدار' })).toBeVisible({ timeout: 20_000 });
});

test('من غير رفوف مختارة: «صفوف التصنيفات» التلقائية شغّالة بعدد الرفوف اللي في اللوحة', async ({ page }) => {
  await stub(page, seed({ categories: { item_limit: 1 } }));
  await page.goto('/');
  await expect(page.locator('.shelf-section').first()).toBeVisible({ timeout: 20_000 });
  const list = await headings(page);
  // the books' own categories are all «نحو» here: one automatic shelf, not three
  expect(list.filter((t) => t === 'نحو')).toHaveLength(1);
});

test('اللوحة مش متاحة (مفيش صفوف محفوظة): الصفحة بترتيبها القديم من «مظهر المتجر»', async ({ page }) => {
  await stub(page, []);
  await page.goto('/');
  await expect(page.locator('.shelf-section').first()).toBeVisible({ timeout: 20_000 });
  const list = await headings(page);
  expect(list.indexOf('أقسام المتجر')).toBeLessThan(list.indexOf('الأكثر مبيعًا'));
});

test('صفحة الكتاب: «كتب قد تعجبك» بعنوانها وعددها، ومخفية لو اتقفلت', async ({ page }) => {
  await stub(page, [...seed(), strip({ title_ar: 'ممكن يعجبك', item_limit: 6 })]);
  await page.goto('/book/b1');
  const related = page.getByTestId('book-related');
  await expect(related).toBeVisible({ timeout: 20_000 });
  await expect(related.getByRole('heading', { name: 'ممكن يعجبك' })).toBeVisible();
  await expect(related.locator('article.book-card')).toHaveCount(6);

  await page.unroute('**/rest/v1/home_layout*');
  await page.route('**/rest/v1/home_layout*', (route) => route.fulfill({ json: [...seed(), strip({ visible: false })] }));
  await page.reload();
  await expect(page.locator('.bk3-info__acts')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('book-related')).toHaveCount(0);
});

test('صفحة الكتاب من غير إعداد محفوظ: زي ما كانت (٤ كتب بعنوانها)', async ({ page }) => {
  await stub(page, seed());
  await page.goto('/book/b1');
  const related = page.getByTestId('book-related');
  await expect(related).toBeVisible({ timeout: 20_000 });
  await expect(related.getByRole('heading', { name: 'كتب قد تعجبك' })).toBeVisible();
  await expect(related.locator('article.book-card')).toHaveCount(4);
});
