import { createRequire } from 'node:module';
import { test, expect, type Page } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «تنزيل تقرير» in إدارة الكتب: the report's columns as buttons. What is off is not in the file at all; the standard hides the
// lowest / highest selling price and the period's sales revenue and shows the cost price. Hermetic: nothing is written.

test.use({ storageState: { cookies: [], origins: [] } });

const DASH = process.env.E2E_DASHBOARD_DIR || '/Users/user/Desktop/DarAlfath_Dash';
const ExcelJS = createRequire(`${DASH}/package.json`)('exceljs') as typeof import('exceljs');

const variant = (id: string, productId: string, over: Record<string, unknown>) => ({
  id, product_id: productId, variant_name: 'ورق عادي', variant_type: 'مادي', sku: null, iap_product_id: null, price: 80, cost_price: 30, base_price: 100, sale_price: 80, sale_channel: 'all', weight_kg: 0.4, ...over,
});
const book = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, title, author: 'مؤلف', publisher: 'دار الفتح', page_count: 120, publication_year: 2025, description: 'وصف', cover_url: null, category_id: 'cat-1', isbn: null, keywords: [],
  type: 'ورقي', cost_price: 30, base_price: 100, sale_price: 80, profit: 50, is_active: true, is_bundle: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  categories: { id: 'cat-1', name: 'النحو', slug: 'nahw' }, electronic_books: null, product_series: [], product_categories: [], bundle_items: [], product_variants: [], ...over,
});
const BOOKS = [
  book('p1', 'قواعد النحو', { product_variants: [variant('v1', 'p1', { sku: 'N-P', cost_price: 30, sale_price: 80 }), variant('v2', 'p1', { variant_name: 'مقاس 24*17', sku: 'N-L', cost_price: 45, sale_price: 120, base_price: 120 })] }),
  book('p2', 'أساسيات الإملاء', { product_variants: [variant('v3', 'p2', { sku: 'I-1', cost_price: 18, sale_price: 60, base_price: 60 })] }),
];

async function setUp(page: Page) {
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/products?*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOOKS) });
  });
  await page.goto('/books');
  await expect(page.locator('tbody tr').filter({ has: page.getByTitle('تعديل') }).first()).toBeVisible({ timeout: 20_000 });
}

const open = async (page: Page) => {
  await page.getByTestId('report-download').click();
  await expect(page.getByTestId('report-panel')).toBeVisible();
};
const chip = (page: Page, group: string, key: string) => page.getByTestId(`col-${group}-${key}`);

async function download(page: Page) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-run').click()]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await d.path())!);
  return wb;
}
const headersOf = (ws: import('exceljs').Worksheet) => {
  let header: string[] = [];
  ws.eachRow((row) => {
    const values = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v)));
    // the sheet's own header row is the one that starts with the book column
    if (!header.length && values[0] === 'الكتاب') header = values.filter(Boolean);
  });
  return header;
};

test('الشكل الافتراضي: سعر التكلفة ظاهر، وأقل وأعلى سعر بيع ومبيعات الفترة مقفولين', async ({ page }) => {
  await setUp(page);
  await open(page);
  await expect(chip(page, 'books', 'cost')).toHaveAttribute('data-on', 'true');
  for (const key of ['minPrice', 'maxPrice', 'revenue']) await expect(chip(page, 'books', key)).toHaveAttribute('data-on', 'false');
  await expect(chip(page, 'books', 'unitsSold')).toHaveAttribute('data-on', 'true');
  // the book column is fixed
  await expect(chip(page, 'books', 'title')).toHaveAttribute('data-on', 'true');
  await expect(chip(page, 'books', 'title')).not.toHaveAttribute('role', 'switch');
  await expect(page.getByTestId('sheet-copies')).toHaveAttribute('aria-checked', 'true');
});

test('التقرير الافتراضي: الشيت من غير الأعمدة التلاتة، وسعر التكلفة هو أقل تكلفة للكتاب', async ({ page }) => {
  await setUp(page);
  await open(page);
  const wb = await download(page);
  const names = wb.worksheets.map((w) => w.name);
  expect(names).toEqual(['الملخص', 'قائمة الكتب', 'النسخ والأسعار']);
  const list = headersOf(wb.worksheets[1]);
  expect(list).toContain('سعر التكلفة (ج.م)');
  for (const gone of ['أقل سعر بيع (ج.م)', 'أعلى سعر بيع (ج.م)', 'مبيعات الفترة (ج.م)']) expect(list).not.toContain(gone);
  const ws = wb.worksheets[1];
  const costColumn = list.indexOf('سعر التكلفة (ج.م)') + 1;
  const titleColumn = 1;
  const byTitle = new Map<string, unknown>();
  ws.eachRow((row) => byTitle.set(String(row.getCell(titleColumn).value), row.getCell(costColumn).value));
  expect(byTitle.get('قواعد النحو')).toBe(30); // the lowest of 30 and 45
  expect(byTitle.get('أساسيات الإملاء')).toBe(18);
});

test('اللي تختاره بيتعمل له عمود، واللي تقفله مش بيظهر خالص، وبيتحفظ اختيارك', async ({ page }) => {
  await setUp(page);
  await open(page);
  await chip(page, 'books', 'minPrice').click();
  await chip(page, 'books', 'publisher').click();
  await chip(page, 'books', 'cost').click(); // off
  await chip(page, 'books', 'isbn').click(); // off
  let wb = await download(page);
  let list = headersOf(wb.worksheets[1]);
  expect(list).toContain('أقل سعر بيع (ج.م)');
  expect(list).toContain('الناشر');
  expect(list).not.toContain('سعر التكلفة (ج.م)');
  expect(list).not.toContain('ISBN');
  // the cells line up with the headers
  const at = list.indexOf('أقل سعر بيع (ج.م)') + 1;
  const prices = new Map<string, unknown>();
  wb.worksheets[1].eachRow((row) => prices.set(String(row.getCell(1).value), row.getCell(at).value));
  expect(prices.get('قواعد النحو')).toBe(80);

  await page.reload();
  await expect(page.locator('tbody tr').filter({ has: page.getByTitle('تعديل') }).first()).toBeVisible({ timeout: 20_000 });
  await open(page);
  await expect(chip(page, 'books', 'minPrice')).toHaveAttribute('data-on', 'true');
  await expect(chip(page, 'books', 'cost')).toHaveAttribute('data-on', 'false');
  wb = await download(page);
  list = headersOf(wb.worksheets[1]);
  expect(list).toContain('الناشر');
});

test('ورقة «النسخ والأسعار» ممكن تتشال كلها، و«الكل» بيفتح كل حاجة تخص الكتاب', async ({ page }) => {
  await setUp(page);
  await open(page);
  await page.getByTestId('sheet-copies').click();
  await expect(page.getByTestId('column-group-copies')).toContainText('مش هتظهر');
  let wb = await download(page);
  expect(wb.worksheets.map((w) => w.name)).toEqual(['الملخص', 'قائمة الكتب']);

  await open(page); // the panel closes after a download
  await page.getByTestId('sheet-copies').click();
  await page.getByTestId('cols-all-books').click();
  for (const key of ['minPrice', 'maxPrice', 'revenue', 'publisher', 'year', 'pages', 'description', 'keywords', 'skus', 'extraCategories', 'copyNames', 'weight', 'basePrice', 'discount', 'ebookFormat', 'ebookSize', 'cover', 'bundleItems']) {
    await expect(chip(page, 'books', key)).toHaveAttribute('data-on', 'true');
  }
  wb = await download(page);
  const list = headersOf(wb.worksheets[1]);
  for (const header of ['الناشر', 'سنة النشر', 'عدد الصفحات', 'وصف الكتاب', 'الكلمات المفتاحية', 'SKU (كل النسخ)', 'تصنيفات إضافية', 'أسماء النسخ', 'الوزن (كجم)', 'محتويات المجموعة', 'رابط الغلاف']) {
    expect(list).toContain(header);
  }
  await open(page);
  await page.getByTestId('cols-standard-books').click();
  await expect(chip(page, 'books', 'minPrice')).toHaveAttribute('data-on', 'false');
  await expect(chip(page, 'books', 'cost')).toHaveAttribute('data-on', 'true');
});

test('لو مفيش عمود مبيعات مختار التقرير مبيقراش الطلبات ومفيش مؤشرات مبيعات', async ({ page }) => {
  let orderReads = 0;
  await setUp(page);
  await page.route('**/rest/v1/orders?*', (route) => { orderReads += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
  await open(page);
  await chip(page, 'books', 'unitsSold').click();
  await chip(page, 'copies', 'unitsSold').click();
  await chip(page, 'copies', 'revenue').click();
  const wb = await download(page);
  expect(orderReads).toBe(0);
  const summary: string[] = [];
  wb.worksheets[0].eachRow((row) => summary.push(String(row.getCell(1).value)));
  expect(summary).not.toContain('النسخ المباعة خلال الفترة');
  expect(summary).toContain('عدد الكتب');
});
