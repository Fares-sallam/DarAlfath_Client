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

const rows = (page: Page) => page.locator('tbody tr').filter({ has: page.getByTitle('تعديل') });

async function setUp(page: Page) {
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/products?*', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOOKS) }) : route.fallback());
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
