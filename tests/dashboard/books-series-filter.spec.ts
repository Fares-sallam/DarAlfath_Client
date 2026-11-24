import { test, expect, type Page } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// إدارة الكتب: the «السلسلة» filter next to the category one. Hermetic: no real sign-in, the books and the series are
// answered here, nothing is written.

test.use({ storageState: { cookies: [], origins: [] } });

const book = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, title, author: 'مؤلف', publisher: null, page_count: null, publication_year: null, description: 'وصف', cover_url: null, category_id: 'cat-1', isbn: null, keywords: [],
  type: 'ورقي', cost_price: 20, base_price: 50, sale_price: null, profit: 30, is_active: true, is_bundle: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  categories: { id: 'cat-1', name: 'النحو', slug: 'nahw' }, electronic_books: null, product_series: [], product_categories: [], bundle_items: [], product_variants: [], ...over,
});
const inSeries = (id: string, name: string) => [{ series_id: id, book_series: { id, name, author: null } }];

const BOOKS = [
  book('p1', 'قواعد النحو', { created_at: '2026-03-01T00:00:00Z', product_series: inSeries('s1', 'سلسلة اللغة العربية') }),
  book('p2', 'أساسيات الإملاء', { created_at: '2026-02-01T00:00:00Z', product_series: [...inSeries('s1', 'سلسلة اللغة العربية'), ...inSeries('s2', 'سلسلة الرياحين')] }),
  book('p3', 'قصص الأنبياء', { created_at: '2026-01-15T00:00:00Z', product_series: inSeries('s2', 'سلسلة الرياحين') }),
  book('p4', 'كتاب بلا سلسلة', { created_at: '2026-01-01T00:00:00Z' }),
];
const SERIES = [{ id: 's1', name: 'سلسلة اللغة العربية', author: null }, { id: 's2', name: 'سلسلة الرياحين', author: null }];

const node = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, parent_id: null, type: 'series', name_ar: name, name_en: null, slug: id, description_ar: null, description_en: null, image_url: null, icon: null, color: null,
  is_active: true, featured: false, show_web: true, show_app: true, sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true,
  hide_when_empty: true, books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null, intro_ar: null,
  intro_en: null, video_url: null, page_layout: 'auto', strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
});
// قسم الكبار ← سلسلة اللغة العربية (s1) ← تصنيف الكتابة (cat-3)؛ سلسلة الرياحين (s2) برا؛ تصنيفا النحو (cat-1) والقصص (cat-2) برا
const NODES = [
  node('sec1', 'قسم الكبار', { type: 'section' }),
  node('s1', 'سلسلة اللغة العربية', { parent_id: 'sec1' }),
  node('cat-3', 'الكتابة', { type: 'category', parent_id: 's1' }),
  node('s2', 'سلسلة الرياحين'),
  node('cat-1', 'النحو', { type: 'category' }),
  node('cat-2', 'القصص', { type: 'category' }),
];
const CATEGORIES = [
  { id: 'cat-1', name: 'النحو', slug: 'nahw', description: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-2', name: 'القصص', slug: 'qisas', description: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-3', name: 'الكتابة', slug: 'kitaba', description: null, created_at: '2026-01-01T00:00:00Z' },
];

const rows = (page: Page) => page.locator('tbody tr').filter({ has: page.getByTitle('تعديل') });

async function setUp(page: Page) {
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/products?*', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOOKS) }) : route.fallback());
  await page.route('**/rest/v1/catalog_nodes*', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NODES) }) : route.fallback());
  await page.route('**/rest/v1/categories?*', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATEGORIES) }) : route.fallback());
  await page.route('**/rest/v1/book_series?*', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SERIES) }) : route.fallback());
  await page.goto('/books');
  await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^فلترة/ }).click();
}

test('فلتر السلسلة: كل السلاسل في القايمة، واختيار سلسلة بيعرض كتبها بس، والإعادة بترجّع الكل', async ({ page }) => {
  await setUp(page);
  const select = page.getByTestId('filter-series');
  await expect(select.locator('option')).toHaveText(['كل السلاسل', 'سلسلة اللغة العربية', 'سلسلة الرياحين']);
  await expect(rows(page)).toHaveCount(4);

  await select.selectOption('s1');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: 'قواعد النحو' })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: 'أساسيات الإملاء' })).toHaveCount(1);

  // a book in two series shows under each
  await select.selectOption('s2');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: 'أساسيات الإملاء' })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: 'قصص الأنبياء' })).toHaveCount(1);

  await page.getByRole('button', { name: 'إعادة' }).click();
  await expect(select).toHaveValue('الكل');
  await expect(rows(page)).toHaveCount(4);
});

test('فلتر السلسلة مع فلتر التصنيف: الاتنين مع بعض، وتسمية الفلتر في التصدير فيها السلسلة', async ({ page }) => {
  await setUp(page);
  await page.getByTestId('filter-series').selectOption('s2');
  await page.getByPlaceholder('ابحث بالعنوان، المؤلف، ISBN...').fill('قصص');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('قصص الأنبياء');

  await page.getByTestId('books-export').click();
  await page.getByTestId('export-scope-filtered').click();
  await expect(page.getByTestId('books-export-panel')).toContainText('السلسلة: سلسلة الرياحين');
});

test('فلتر القسم: كتب كل اللي جوه القسم، والتصنيف بيشمل الإضافي، زي تاب «الكتب» في السلاسل والتصنيفات', async ({ page }) => {
  await setUp(page);
  const section = page.getByTestId('filter-section');
  await expect(section.locator('option')).toHaveText(['كل الأقسام', 'قسم الكبار']);

  // قسم الكبار holds سلسلة اللغة العربية: p1 and p2 are in it, p3 (only الرياحين) and p4 are not
  await section.selectOption('sec1');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: 'قواعد النحو' })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: 'قصص الأنبياء' })).toHaveCount(0);

  // together with the series filter
  await page.getByTestId('filter-series').selectOption('s2');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('أساسيات الإملاء');
  await page.getByRole('button', { name: 'إعادة' }).click();
  await expect(section).toHaveValue('الكل');
  await expect(rows(page)).toHaveCount(4);
});

test('فلتر التصنيف: الأساسي والإضافي، وكتاب تصنيفه الأساسي تحت سلسلة بيظهر في فلتر السلسلة والقسم', async ({ page }) => {
  await signInAsFakeOwner(page);
  const books = [
    book('q1', 'كتاب أساسي', { category_id: 'cat-2', categories: { id: 'cat-2', name: 'القصص', slug: 'qisas' } }),
    book('q2', 'كتاب إضافي', { category_id: 'cat-3', categories: { id: 'cat-3', name: 'الكتابة', slug: 'kitaba' }, product_categories: [{ category_id: 'cat-2', categories: { id: 'cat-2', name: 'القصص', slug: 'qisas' } }] }),
    book('q3', 'كتاب تحت السلسلة', { category_id: 'cat-3', categories: { id: 'cat-3', name: 'الكتابة', slug: 'kitaba' } }),
  ];
  await page.route('**/rest/v1/products?*', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(books) }) : route.fallback());
  await page.route('**/rest/v1/catalog_nodes*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NODES) }));
  await page.route('**/rest/v1/categories?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATEGORIES) }));
  await page.route('**/rest/v1/book_series?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SERIES) }));
  await page.goto('/books');
  await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^فلترة/ }).click();

  // الأساسي (q1) and الإضافي (q2) both show under تصنيف القصص
  await page.getByTestId('filter-category').selectOption('cat-2');
  await expect(rows(page)).toHaveCount(2);
  // q2 and q3 are filed under تصنيف الكتابة, which sits under سلسلة اللغة العربية under قسم الكبار (no book is linked to them directly)
  await page.getByRole('button', { name: 'إعادة' }).click();
  await page.getByTestId('filter-series').selectOption('s1');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: 'كتاب إضافي' })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: 'كتاب أساسي' })).toHaveCount(0);
  await page.getByRole('button', { name: 'إعادة' }).click();
  await page.getByTestId('filter-section').selectOption('sec1');
  await expect(rows(page)).toHaveCount(2);
});
