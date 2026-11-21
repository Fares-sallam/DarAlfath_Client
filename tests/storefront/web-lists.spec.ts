import { test, expect, type Page } from '../fixtures';

// The website's own lists from the catalog tree (the dashboard keeps a separate switch and order for the app): the
// series cards under the home banner, the category strip under the header and the categories page. Answered by the
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
  // series: the website's order is the reverse of the app's, one is app-only, one is empty
  node({ id: 'ser-a', type: 'series', name_ar: 'سلسلة أ', slug: 'ser-a', sort_web: 1, sort_app: 0, image_url: 'https://example.com/a.png', show_in_bar_web: false }),
  node({ id: 'ser-b', type: 'series', name_ar: 'سلسلة ب', slug: 'ser-b', sort_web: 0, sort_app: 1, show_in_bar_web: false }),
  node({ id: 'ser-app', type: 'series', name_ar: 'سلسلة للتطبيق فقط', slug: 'ser-app', sort_web: 2, show_web: false, show_in_bar_web: false }),
  node({ id: 'ser-empty', type: 'series', name_ar: 'سلسلة فاضية', slug: 'ser-empty', sort_web: 3, show_in_bar_web: false }),
  node({ id: 'ser-keep', type: 'series', name_ar: 'سلسلة فاضية بتفضل', slug: 'ser-keep', sort_web: 4, hide_when_empty: false, show_in_bar_web: false }),
  // categories: in the series, one inside another, one in the bar for the app only, one in no series
  node({ id: 'c1', parent_id: 'ser-a', name_ar: 'نحو', slug: 'nahw', sort_web: 1 }),
  node({ id: 'c2', parent_id: 'ser-a', name_ar: 'إملاء', slug: 'imla', sort_web: 0 }),
  node({ id: 'c2a', parent_id: 'c2', name_ar: 'إملاء متقدم', slug: 'imla-adv', sort_web: 0 }),
  node({ id: 'c3', parent_id: 'ser-b', name_ar: 'قصص', slug: 'qisas', sort_web: 2, show_in_bar_web: false }),
  node({ id: 'c4', parent_id: null, name_ar: 'تصنيف سايب', slug: 'loose', sort_web: 3 }),
  node({ id: 'c5', parent_id: 'ser-a', name_ar: 'تصنيف فاضي', slug: 'empty-cat', sort_web: 4 }),
];
const link = (product_id: string, node_id: string) => ({ product_id, node_id, is_primary: false, sort_order: 0 });
const LINKS = [
  link('b1', 'c1'), link('b1', 'ser-a'), link('b2', 'c2'), link('b2', 'ser-a'), link('b3', 'c2a'), link('b3', 'ser-a'),
  link('b4', 'c3'), link('b4', 'ser-b'), link('b5', 'c4'), link('b5', 'ser-app'),
];
const BOOKS = ['b1', 'b2', 'b3', 'b4', 'b5'];

async function stubTree(page: Page, nodes = NODES) {
  await page.route('**/rest/v1/catalog_nodes*', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: nodes })));
  await page.route('**/rest/v1/product_nodes*', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: nodes.length ? LINKS : [] })));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: BOOKS.map((product_id, i) => ({
        product_id, title: `كتاب ${i + 1}`, author: 'مؤلف', category_slug: 'nahw', category_name: 'نحو', type: 'ورقي',
        country_code: 'EG', min_price: 50, max_price: 50, starting_price: 50, images: [],
      })),
    }));
}

test('كروت «أقسام المتجر»: بترتيب الموقع، والمخفي عن الموقع مبيظهرش، والفاضية بتتخفى إلا لو متعلّم عليها تفضل', async ({ page }) => {
  await stubTree(page);
  await page.goto('/');
  const cards = page.locator('.department-card');
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });
  // the website's order (سلسلة ب first), not the app's; nothing for the app-only series or the empty one
  await expect(cards.locator('.department-card__label')).toHaveText(['سلسلة ب', 'سلسلة أ', 'سلسلة فاضية بتفضل']);
  await expect(cards.filter({ hasText: 'سلسلة أ' })).toHaveAttribute('href', '/books?series=ser-a');
  await expect(cards.filter({ hasText: 'سلسلة أ' }).locator('img')).toHaveAttribute('src', 'https://example.com/a.png');
});

test('شريط التصنيفات: اللي متعلّم عليهم للموقع وفيهم كتب بس، بترتيب الموقع، ورابطهم باسمهم في العنوان', async ({ page }) => {
  await stubTree(page);
  await page.goto('/contact');
  const pills = page.locator('.category-bar__pill');
  await expect(pills.first()).toBeVisible({ timeout: 20_000 });
  // كل الكتب، كل التصنيفات, then the tree by the website's order: إملاء and the one inside it (both 0, by name), نحو (1), تصنيف سايب (3);
  // القصص is off the bar for the website, the empty category has no books
  await expect(pills).toHaveText(['كل الكتب', 'كل التصنيفات', 'إملاء', 'إملاء متقدم', 'نحو', 'تصنيف سايب']);
  await expect(pills.filter({ hasText: 'نحو' })).toHaveAttribute('href', '/books?category=nahw');
});

test('صفحة التصنيفات: التصنيفات تحت سلاسلها، «تصنيفات أخرى» للسايب، وبدون المجموعات المشتقة من النوع', async ({ page }) => {
  await stubTree(page);
  await page.goto('/categories');
  await expect(page.getByTestId('taxonomy-group').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'السلاسل والمجموعات' })).toHaveCount(0);

  const groups = page.getByTestId('taxonomy-group');
  // in the website's order: سلسلة ب (sort 0), سلسلة أ (sort 1), then the categories in no series
  await expect(groups.locator('h2')).toHaveText(['سلسلة ب', 'سلسلة أ', 'تصنيفات أخرى']);
  await expect(groups.nth(0).locator('h3')).toHaveText(['قصص']);
  // inside سلسلة أ: the tree's order, a category's inner category right after it; the empty one is left out
  await expect(groups.nth(1).locator('h3')).toHaveText(['إملاء', 'إملاء متقدم', 'نحو']);
  await expect(groups.nth(2).locator('h3')).toHaveText(['تصنيف سايب']);
  await expect(groups.nth(1).getByRole('link', { name: 'عرض سلسلة أ' })).toHaveAttribute('href', '/books?series=ser-a');

  // a category with a category inside it counts and opens both; a plain one keeps its address
  const imla = groups.nth(1).locator('.taxonomy-card', { hasText: 'إملاء' }).first();
  await expect(imla.getByText('2 كتاب داخل هذا التصنيف')).toBeAttached();
  await expect(imla.getByRole('link', { name: /عرض كل كتب إملاء$/ })).toHaveAttribute('href', '/books?node=c2');
  await expect(groups.nth(1).locator('.taxonomy-card', { hasText: 'نحو' }).getByRole('link', { name: 'عرض كل كتب نحو' })).toHaveAttribute('href', '/books?category=nahw');
});

test('الشجرة مش بتتقرا: القوائم الثلاثة بترجع للجداول القديمة', async ({ page }) => {
  await stubTree(page, []);
  await page.route('**/rest/v1/book_series*', (route) =>
    route.request().method() !== 'GET' ? route.fallback() : route.fulfill({
      json: [{ id: 'old-1', name: 'سلسلة قديمة', description: null, cover_url: null, sort_order: 0, product_series: [{ product_id: 'b1' }] }],
    }));
  await page.route('**/rest/v1/categories*', (route) => route.fulfill({ json: [{ id: 'k1', slug: 'nahw', name: 'نحو' }] }));
  await page.route('**/rest/v1/category_bar_items*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/product_categories*', (route) => route.fulfill({ json: [] }));

  await page.goto('/');
  await expect(page.locator('.department-card__label')).toHaveText(['سلسلة قديمة'], { timeout: 20_000 });
  await expect(page.locator('.category-bar__pill', { hasText: 'نحو' })).toBeVisible();
  await page.goto('/categories');
  await expect(page.locator('.taxonomy-card').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('taxonomy-group')).toHaveCount(0);
});

test('صفحة تصنيف: عنوان البحث من اللوحة، وتصنيف إضافي بس (مش أساسي لأي كتاب) ليه اسمه', async ({ page }) => {
  const nodes = NODES.map((n) => (n.id === 'c4' ? { ...n, seo_title: 'عنوان خاص بالتصنيف السايب', seo_description: 'وصف خاص' } : n));
  await stubTree(page, nodes);
  await page.goto('/books?category=loose');
  await expect(page).toHaveTitle(/عنوان خاص بالتصنيف السايب/, { timeout: 20_000 });
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /وصف خاص/);
});
