import { test, expect, type Page } from '../fixtures';

// The home page's category shelves as the dashboard's «الصفحة الرئيسية» tab sets them: which categories get a shelf, in what
// order, with what title and how many books; with none chosen the page keeps its first three categories. Answered by the
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
  node({ id: 'ser', type: 'series', name_ar: 'سلسلة الاختبار', slug: 'ser' }),
  node({ id: 'nahw', parent_id: 'ser', name_ar: 'نحو', slug: 'nahw', sort_web: 0 }),
  node({ id: 'imla', name_ar: 'إملاء', slug: 'imla', sort_web: 1 }),
  node({ id: 'qisas', name_ar: 'قصص', slug: 'qisas', sort_web: 2 }),
  node({ id: 'empty', name_ar: 'فاضي', slug: 'empty', sort_web: 3 }),
];
const link = (product_id: string, node_id: string) => ({ product_id, node_id, is_primary: false, sort_order: 0 });
const BOOKS = Array.from({ length: 10 }, (_, i) => `b${i + 1}`);
const LINKS = [
  ...BOOKS.slice(0, 6).map((b) => link(b, 'nahw')), // 6 books in نحو (and so in the series)
  ...BOOKS.slice(0, 6).map((b) => link(b, 'ser')),
  link('b7', 'imla'), link('b8', 'imla'),
  link('b9', 'qisas'),
];

const row = (nodeId: string, order: number, over: Record<string, unknown> = {}) => ({
  section_key: `shelf:${nodeId}`, node_id: nodeId, title_ar: null, item_limit: null, visible: true, sort_order: order, ...over,
});

async function stub(page: Page, shelves: unknown[]) {
  await page.route('**/rest/v1/home_layout*', (route) => route.fulfill({ json: shelves }));
  await page.route('**/rest/v1/catalog_nodes*', (route) => route.fulfill({ json: NODES }));
  await page.route('**/rest/v1/product_nodes*', (route) => route.fulfill({ json: LINKS }));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: BOOKS.map((product_id, i) => ({
        product_id, title: `كتاب ${String(i + 1).padStart(2, '0')}`, author: 'مؤلف', category_slug: 'nahw', category_name: 'نحو',
        country_code: 'EG', min_price: 50, max_price: 50, starting_price: 50, images: [],
      })),
    }));
}

const shelves = (page: Page) => page.locator('section.shelf-section').filter({ has: page.getByRole('link', { name: 'عرض التصنيف' }) });

test('الرفوف المختارة: بترتيب اللوحة، بعنوانها وعدد كتبها، والمخفي والفاضي مبيظهروش', async ({ page }) => {
  await stub(page, [
    row('qisas', 2),
    row('nahw', 0, { title_ar: 'قواعد النحو', item_limit: 4 }),
    row('imla', 1, { visible: false }),
    row('empty', 3),
  ]);
  await page.goto('/');
  await expect(shelves(page).first()).toBeVisible({ timeout: 20_000 });
  await expect(shelves(page).locator('h2')).toHaveText(['قواعد النحو', 'قصص']);

  const nahw = shelves(page).first();
  await expect(nahw.locator('.shelf-rail__item')).toHaveCount(4); // the limit, not the 6 books it holds
  await expect(nahw.getByRole('link', { name: 'عرض التصنيف' })).toHaveAttribute('href', '/books?category=nahw');
  await expect(shelves(page).nth(1).locator('.shelf-rail__item')).toHaveCount(1);
});

test('رف لسلسلة: بيفتح صفحة السلسلة، وكتبها بترتيب الموقع (أبجدي هنا)', async ({ page }) => {
  await stub(page, [row('ser', 0)]);
  await page.goto('/');
  const shelf = shelves(page).first();
  await expect(shelf).toBeVisible({ timeout: 20_000 });
  await expect(shelf.locator('h2')).toHaveText('سلسلة الاختبار');
  await expect(shelf.getByRole('link', { name: 'عرض التصنيف' })).toHaveAttribute('href', '/books?series=ser');
  await expect(shelf.locator('article.book-card').first()).toHaveAttribute('aria-label', 'فتح صفحة كتاب 01');
});

test('تصنيف فيه تصنيفات جواه: رفّه بيفتح صفحته بالـid (عشان يشمل اللي جواه)', async ({ page }) => {
  const nodes = NODES.map((n) => (n.id === 'imla' ? { ...n, parent_id: null } : n));
  nodes.push(node({ id: 'imla-adv', parent_id: 'imla', name_ar: 'إملاء متقدم', slug: 'imla-adv', sort_web: 0 }));
  await stub(page, [row('imla', 0)]);
  await page.route('**/rest/v1/catalog_nodes*', (route) => route.fulfill({ json: nodes }));
  await page.goto('/');
  const shelf = shelves(page).first();
  await expect(shelf).toBeVisible({ timeout: 20_000 });
  await expect(shelf.getByRole('link', { name: 'عرض التصنيف' })).toHaveAttribute('href', '/books?node=imla');
});

test('مفيش رفوف مختارة: الصفحة بتفضل بأول ٣ تصنيفات زي ما كانت', async ({ page }) => {
  await stub(page, []);
  await page.goto('/');
  // the books' own categories (all of them نحو here): one shelf, drawn the old way
  await expect(shelves(page).first()).toBeVisible({ timeout: 20_000 });
  await expect(shelves(page).locator('h2')).toHaveText(['نحو']);
});

test('كل الرفوف المختارة مخفية: مفيش رفوف تصنيفات خالص (مش الأول ٣)', async ({ page }) => {
  await stub(page, [row('nahw', 0, { visible: false })]);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'وصل حديثًا' }).or(page.locator('.store-departments')).first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(shelves(page)).toHaveCount(0);
});
