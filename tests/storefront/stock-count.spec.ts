import { test, expect, type Page, type Route } from '../fixtures';

// The number of copies customers see (set in the dashboard's «إدارة المخزون»: one switch for the website, one for the app):
// under each edition on a book's page («متوفر 12 نسخة»), in the «باقي N نسخ فقط» note and on the card's «آخر N نسخ» badge. With the
// website's switch off the number is replaced by words; nothing else changes. Answered by the test; nothing is written.

const ID = '11111111-1111-4111-8111-111111111111';
const ROW = (over: Record<string, unknown> = {}) => ({
  id: 1, display: { card: { show: { lowStock: { web: true, app: true } }, lowStockAt: 50 }, page: { show: { stockHint: { web: true, app: true } } } }, ...over,
});
const PRODUCT = {
  product_id: ID, title: 'كتاب اختبار المخزون', author: 'مؤلف', category_slug: 'c', category_name: 'تصنيف', country_code: 'EG',
  min_price: 50, max_price: 50, starting_price: 50, images: [], variant_count: 3, is_bundle: false, created_at: '2020-01-01T00:00:00Z', currency_symbol: 'ج.م',
};
const edition = (id: string, name: string, stock: number) => ({
  variant_id: id, product_id: ID, variant_name: name, variant_type: 'ورقي', price: 50, old_price: 50, new_price: 50,
  is_digital: false, is_available: stock > 0, available_stock: stock, country_code: 'EG', currency_symbol: 'ج.م',
});
const VARIANTS = [edition('v1', 'غلاف عادي', 12), edition('v2', 'غلاف فاخر', 3), edition('v3', 'نسخة نفدت', 0)];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

/** The shop as the test serves it; `appearance` is what storefront_appearance answers (or an error to simulate a missing column). */
async function serve(page: Page, appearance: Record<string, unknown> | { error: string }) {
  await page.route('**/rest/v1/storefront_appearance*', (route) => {
    const method = route.request().method();
    if (method !== 'GET' && method !== 'HEAD') return route.fallback();
    if ('error' in appearance) return json(route, { code: '42703', message: appearance.error }, 400);
    return json(route, appearance);
  });
  await page.route('**/rest/v1/products_public_catalog*', (route) => json(route, [PRODUCT]));
  await page.route('**/rest/v1/product_variants_public*', (route) => json(route, VARIANTS));
  await page.route('**/rest/v1/product_review_stats*', (route) => json(route, []));
  await page.route('**/rest/v1/product_images*', (route) => json(route, []));
}

const avail = (page: Page) => page.locator('.bk3-var__avail');
const openBook = async (page: Page, query = '') => {
  await page.goto(`/book/${ID}${query}`);
  await expect(page.locator('.bk3-var').first()).toBeVisible({ timeout: 20_000 });
};

test('من غير إعداد محفوظ: العدد ظاهر زي ما كان (تحت الطبعة، وفي «باقي N نسخ»)', async ({ page }) => {
  await serve(page, ROW());
  await openBook(page);
  await expect(avail(page)).toHaveText(['متوفر 12 نسخة', 'متوفر 3 نسخة', 'غير متوفر']);
  await expect(page.getByTestId('book-stock-hint')).toContainText('باقي');
  await expect(page.getByTestId('book-stock-hint')).toContainText('١٥');
});

test('زرار الموقع مقفول: الطبعات «متوفر» من غير رقم، و«غير متوفر» لما تخلص، والتنبيه «آخر النسخ»', async ({ page }) => {
  await serve(page, ROW({ show_stock_count: { web: false, app: true } }));
  await openBook(page);
  await expect(avail(page)).toHaveText(['متوفر', 'متوفر', 'غير متوفر']);
  await expect(page.getByTestId('book-stock-hint')).toHaveText('آخر النسخ');
  // not a single digit is left in what is said about the copies
  expect(await avail(page).allInnerTexts()).not.toEqual(expect.arrayContaining([expect.stringMatching(/\d/)]));
  await expect(page.getByTestId('book-stock-hint')).not.toContainText(/[0-9٠-٩]/);
});

test('زرار الموقع مقفول: شارة «آخر النسخ» على الكارت من غير رقم', async ({ page }) => {
  await serve(page, ROW({ show_stock_count: { web: false, app: true } }));
  await page.goto('/books');
  const badge = page.getByTestId('card-flag-low').first();
  await expect(badge).toBeVisible({ timeout: 20_000 });
  await expect(badge).toHaveText('آخر النسخ');
});

test('الكارت والصفحة بيعرضوا الرقم لما الموقع شغّال: «آخر N نسخ» و«متوفر N نسخة»', async ({ page }) => {
  await serve(page, ROW({ show_stock_count: { web: true, app: false } }));
  await page.goto('/books');
  await expect(page.getByTestId('card-flag-low').first()).toHaveText(/آخر ١٥ نسخ/, { timeout: 20_000 });
  await openBook(page);
  // the app's switch being off changes nothing on the website
  await expect(avail(page).first()).toHaveText('متوفر 12 نسخة');
});

test('العمود مش موجود أو قيمة غريبة: العدد يفضل ظاهر (المخزون ما بيتخفاش بالغلط)', async ({ page }) => {
  await serve(page, { error: 'column storefront_appearance.show_stock_count does not exist' });
  await openBook(page);
  await expect(avail(page).first()).toHaveText('متوفر 12 نسخة');

  const odd = await page.context().newPage();
  await serve(odd, ROW({ show_stock_count: { web: 'no' } }));
  await openBook(odd);
  await expect(avail(odd).first()).toHaveText('متوفر 12 نسخة');
});

test('معاينة اللوحة: الزرار اللي بتجرّبه بيطبّق على صفحة الكتاب قبل الحفظ، والرجوع للمحفوظ', async ({ page }) => {
  await serve(page, ROW());
  await openBook(page, '?preview=display');
  await expect(avail(page).first()).toHaveText('متوفر 12 نسخة');

  const send = (message: Record<string, unknown>) =>
    page.evaluate((m) => window.postMessage({ type: 'daralfath:display-preview', ...m }, window.location.origin), message);
  await send({ stockCount: { web: false, app: true } });
  await expect(avail(page).first()).toHaveText('متوفر');
  await expect(page.getByTestId('book-stock-hint')).toHaveText('آخر النسخ');

  await send({ stockCount: null });
  await expect(avail(page).first()).toHaveText('متوفر 12 نسخة');
});
