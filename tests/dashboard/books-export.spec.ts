import { createRequire } from 'node:module';
import { test, expect, type Page } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «تصدير الكتب» in إدارة الكتب: the books list as one table (SKU, name, author, description, weight, cost price, ISBN, series,
// category), one row per copy, as an Excel file with ONE sheet or as the same table in a PDF. Hermetic: no real sign-in, the
// books are answered here, nothing is written.

test.use({ storageState: { cookies: [], origins: [] } });

const DASH = process.env.E2E_DASHBOARD_DIR || '/Users/user/Desktop/DarAlfath_Dash';
// the test project has no spreadsheet library of its own: read the file with the dashboard's
const ExcelJS = createRequire(`${DASH}/package.json`)('exceljs') as typeof import('exceljs');

const HEADERS = ['SKU', 'اسم الكتاب', 'اسم المؤلف', 'وصف الكتاب', 'وزن الكتاب', 'سعر التكلفة', 'الترقيم الدولي ISBN', 'السلسلة', 'التصنيف'];

const variant = (id: string, productId: string, over: Record<string, unknown>) => ({
  id, product_id: productId, variant_name: 'ورق عادي', variant_type: 'ورقي', sku: null, iap_product_id: null, price: 50, cost_price: 20, base_price: 50, sale_price: null, sale_channel: null, weight_kg: 0.4, ...over,
});
const book = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, title, author: 'مؤلف', publisher: null, page_count: null, publication_year: null, description: 'وصف', cover_url: null, category_id: 'cat-1', isbn: null, keywords: [],
  type: 'ورقي', cost_price: 20, base_price: 50, sale_price: null, profit: 30, is_active: true, is_bundle: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  categories: { id: 'cat-1', name: 'النحو', slug: 'nahw' }, electronic_books: null, product_series: [], product_categories: [], bundle_items: [], product_variants: [], ...over,
});

const BOOKS = [
  book('p1', 'قواعد النحو', {
    author: 'محمد القليعي', description: 'شرح مبسّط للقواعد', isbn: '9780123456789', created_at: '2026-03-01T00:00:00Z',
    product_series: [{ series_id: 's1', book_series: { id: 's1', name: 'سلسلة اللغة العربية', author: null } }],
    product_variants: [variant('v1', 'p1', { sku: 'NAHW-P', weight_kg: 0.35, cost_price: 30 }), variant('v2', 'p1', { variant_name: 'نسخة إلكترونية', variant_type: 'رقمي', sku: 'NAHW-E', weight_kg: 0, cost_price: 12.5 })],
  }),
  book('p2', 'أساسيات الإملاء', { author: 'عبدالرحمن بكر', isbn: '00123', created_at: '2026-02-01T00:00:00Z', product_variants: [variant('v3', 'p2', { sku: null, weight_kg: 0.2, cost_price: 18 })] }),
  book('p3', 'قصص الأنبياء', { author: 'دار الفتح', description: null, created_at: '2026-01-15T00:00:00Z', categories: { id: 'cat-2', name: 'القصص', slug: 'qisas' }, category_id: 'cat-2', product_variants: [variant('v4', 'p3', { sku: 'QISAS-1', weight_kg: 0.5, cost_price: 25 })] }),
];

async function setUp(page: Page, books: unknown[] = BOOKS) {
  await signInAsFakeOwner(page);
  let productReads = 0;
  await page.route('**/rest/v1/products?*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    productReads += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(books) });
  });
  await page.goto('/books');
  await expect(page.locator('tbody tr').filter({ has: page.getByTitle('تعديل') }).first()).toBeVisible({ timeout: 20_000 });
  return { reads: () => productReads };
}

const openPanel = async (page: Page) => {
  await page.getByTestId('books-export').click();
  await expect(page.getByTestId('books-export-panel')).toBeVisible();
};

async function downloadSheet(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()]);
  const file = await download.path();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file!);
  return { wb, name: download.suggestedFilename() };
}

const table = (ws: import('exceljs').Worksheet) => {
  const rows: (string | number | null)[][] = [];
  ws.eachRow((row) => rows.push(Array.from({ length: 9 }, (_, i) => (row.getCell(i + 1).value as string | number | null) ?? null)));
  return rows;
};

test('اللوحة: بتقول الأعمدة وإن الصف لكل نسخة، ومفيش اختيار «الظاهرة بعد الفلترة» من غير فلترة', async ({ page }) => {
  await setUp(page);
  await openPanel(page);
  const panel = page.getByTestId('books-export-panel');
  for (const header of HEADERS) await expect(panel).toContainText(header);
  await expect(panel).toContainText('صف لكل نسخة');
  await expect(page.getByTestId('export-scope-filtered')).toHaveCount(0);
  await expect(page.getByTestId('export-format-excel')).toHaveAttribute('aria-checked', 'true');
});

test('Excel: ملف واحد وشيت واحد بالأعمدة التسعة، وصف لكل نسخة بالترتيب الأبجدي', async ({ page }) => {
  await setUp(page);
  await openPanel(page);
  const { wb, name } = await downloadSheet(page);
  expect(name).toMatch(/^قائمة-الكتب_\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/);
  expect(wb.worksheets).toHaveLength(1);
  const rows = table(wb.worksheets[0]);
  expect(rows[0]).toEqual(HEADERS);
  expect(rows).toHaveLength(5); // header + 4 copies (the first book has two)
  // sorted by title: أساسيات الإملاء, قصص الأنبياء, قواعد النحو (paper then e-book)
  expect(rows.slice(1).map((r) => [r[1], r[0]])).toEqual([
    ['أساسيات الإملاء', null], ['قصص الأنبياء', 'QISAS-1'], ['قواعد النحو', 'NAHW-P'], ['قواعد النحو', 'NAHW-E'],
  ]);
  expect(rows[3]).toEqual(['NAHW-P', 'قواعد النحو', 'محمد القليعي', 'شرح مبسّط للقواعد', 0.35, 30, '9780123456789', 'سلسلة اللغة العربية', 'النحو']);
  expect(rows[4]).toEqual(['NAHW-E', 'قواعد النحو', 'محمد القليعي', 'شرح مبسّط للقواعد', null, 12.5, '9780123456789', 'سلسلة اللغة العربية', 'النحو']);
  expect(rows[1][6]).toBe('00123'); // the ISBN keeps its leading zeros
  expect(rows[2][3]).toBeNull(); // no description
});

test('«كل الكتب» بيقرا كل الكتب من قاعدة البيانات (مش بس اللي في الصفحة)', async ({ page }) => {
  const { reads } = await setUp(page);
  const before = reads();
  await openPanel(page);
  await downloadSheet(page);
  expect(reads()).toBeGreaterThan(before);
});

test('مع فلترة: «الظاهرة بعد الفلترة» بتصدّر اللي ظاهر بس وبنفس ترتيب الصفحة، و«كل الكتب» لسه بتصدّر الكل', async ({ page }) => {
  const { reads } = await setUp(page);
  await page.getByPlaceholder('ابحث بالعنوان، المؤلف، ISBN...').fill('قواعد');
  await expect(page.locator('tbody tr').filter({ has: page.getByTitle('تعديل') })).toHaveCount(1);
  await openPanel(page);
  await expect(page.getByTestId('export-scope-all')).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('export-scope-filtered').click();
  const before = reads();
  const filtered = await downloadSheet(page);
  expect(table(filtered.wb.worksheets[0]).slice(1).map((r) => r[1])).toEqual(['قواعد النحو', 'قواعد النحو']);
  expect(reads()).toBe(before); // the list already on screen is used: nothing is read again

  await openPanel(page);
  await page.getByTestId('export-scope-all').click();
  const all = await downloadSheet(page);
  expect(table(all.wb.worksheets[0])).toHaveLength(5);
});

test('PDF: نفس الجدول بنفس الأعمدة في صفحة الطباعة، وبيتنضّف أي نص', async ({ page }) => {
  await setUp(page, [...BOOKS, book('p4', 'عنوان <b>خطر</b> & أكتر', { author: 'ب & ج', product_variants: [variant('v9', 'p4', { sku: 'X<1>' })] })]);
  await openPanel(page);
  await page.getByTestId('export-format-pdf').click();
  await expect(page.getByTestId('export-run')).toBeVisible();
  await page.getByTestId('export-run').click();
  const frame = page.locator('iframe[data-print-frame]');
  await expect(frame).toHaveCount(1, { timeout: 15_000 });
  const html = await frame.evaluate((el) => (el as HTMLIFrameElement).contentDocument!.documentElement.outerHTML);
  const heads = await frame.evaluate((el) => [...(el as HTMLIFrameElement).contentDocument!.querySelectorAll('th')].map((th) => th.textContent));
  expect(heads).toEqual(HEADERS);
  const rows = await frame.evaluate((el) => [...(el as HTMLIFrameElement).contentDocument!.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)));
  expect(rows).toHaveLength(5);
  expect(rows[0]).toEqual(['—', 'أساسيات الإملاء', 'عبدالرحمن بكر', 'وصف', '0.2', '18.00', '00123', '—', 'النحو']);
  expect(html).not.toContain('<b>خطر</b>');
  expect(html).toContain('size: A4 landscape');
});
