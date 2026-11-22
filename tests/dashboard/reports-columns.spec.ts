import { createRequire } from 'node:module';
import { test, expect, type Page } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// The other reports (orders, inventory, coupons, shipping, analytics, activity log, customers) have the same column buttons as the
// books report: what is off is not in the file at all, a sheet can be left out, and the choice is remembered. Hermetic: no real
// sign-in and every table is empty (the sheets then hold just their headers, which is what is read here).

test.use({ storageState: { cookies: [], origins: [] } });

const DASH = process.env.E2E_DASHBOARD_DIR || '/Users/user/Desktop/DarAlfath_Dash';
const ExcelJS = createRequire(`${DASH}/package.json`)('exceljs') as typeof import('exceljs');

interface Report {
  name: string;
  path: string;
  key: string;
  /** the first sheet's group id, its fixed column (how its header row is found), a column of it to turn off, and an optional sheet (group id) */
  firstGroup: string;
  lock: string;
  off: string;
  sheetGroup: string;
  sheetTitle: string;
}

const REPORTS: Report[] = [
  { name: 'الطلبات', path: '/orders', key: 'orders', firstGroup: 'orders', lock: 'رقم الطلب', off: 'الكوبون', sheetGroup: 'byPayment', sheetTitle: 'ملخص حسب طريقة الدفع' },
  { name: 'المخزون', path: '/inventory', key: 'inventory', firstGroup: 'balances', lock: 'الكتاب', off: 'حد التنبيه', sheetGroup: 'restock', sheetTitle: 'نسخ تحتاج إعادة توريد' },
  { name: 'الكوبونات', path: '/coupons', key: 'coupons', firstGroup: 'coupons', lock: 'الكود', off: 'الحد الأقصى', sheetGroup: '', sheetTitle: '' },
  { name: 'الشحن', path: '/shipping', key: 'shipping', firstGroup: 'shipments', lock: 'رقم الطلب', off: 'ملاحظات العميل', sheetGroup: 'regions', sheetTitle: 'الشحنات حسب المحافظة' },
  { name: 'التحليلات', path: '/analytics', key: 'analytics', firstGroup: 'timeline', lock: 'الفترة', off: 'هامش الربح', sheetGroup: 'payments', sheetTitle: 'طرق الدفع' },
  { name: 'سجل النشاط', path: '/activity', key: 'activity', firstGroup: 'log', lock: 'التاريخ والوقت', off: 'عنوان IP', sheetGroup: 'byTable', sheetTitle: 'النشاط حسب القسم' },
  { name: 'العملاء', path: '/customers', key: 'customers', firstGroup: 'customers', lock: 'العميل', off: 'الدولة', sheetGroup: '', sheetTitle: '' },
];

async function open(page: Page, report: Report) {
  await signInAsFakeOwner(page);
  await page.goto(report.path);
  await page.getByTestId('report-download').click();
  await expect(page.getByTestId('report-panel')).toBeVisible({ timeout: 25_000 });
}
const chip = (page: Page, group: string, label: string) => page.getByTestId(`col-${group}-${label}`);

async function download(page: Page) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-run').click()]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await d.path())!);
  return wb;
}
/** the header row of a sheet: the first row whose first cell is the sheet's first column */
const headerRow = (ws: import('exceljs').Worksheet, first: string) => {
  let header: string[] = [];
  ws.eachRow((row) => {
    const values = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v)));
    if (!header.length && values.includes(first)) header = values.filter(Boolean);
  });
  return header;
};

for (const report of REPORTS) {
  test(`${report.name}: أزرار الأعمدة، وأي عمود مقفول مش في الملف، والاختيار بيتحفظ`, async ({ page }) => {
    await open(page, report);
    const panel = page.getByTestId('column-picker');
    await expect(panel).toBeVisible();
    // everything starts on
    await expect(chip(page, report.firstGroup, report.off)).toHaveAttribute('data-on', 'true');
    let wb = await download(page);
    const sheetNames = wb.worksheets.map((w) => w.name);
    const before = headerRow(wb.worksheets[1], report.lock);
    expect(before.length).toBeGreaterThan(2);
    expect(before.some((h) => h.startsWith(report.off))).toBe(true);

    // turn a column off: it is gone from the file
    await page.getByTestId('report-download').click();
    await chip(page, report.firstGroup, report.off).click();
    await expect(chip(page, report.firstGroup, report.off)).toHaveAttribute('data-on', 'false');
    wb = await download(page);
    const after = headerRow(wb.worksheets[1], report.lock);
    expect(after.some((h) => h.startsWith(report.off))).toBe(false);
    expect(after).toHaveLength(before.length - 1);
    expect(wb.worksheets.map((w) => w.name)).toEqual(sheetNames);

    // remembered after a reload
    await page.reload();
    await page.getByTestId('report-download').click();
    await expect(chip(page, report.firstGroup, report.off)).toHaveAttribute('data-on', 'false', { timeout: 25_000 });
  });

  if (report.sheetGroup) {
    test(`${report.name}: ورقة «${report.sheetTitle}» ممكن تتشال من الملف`, async ({ page }) => {
      await open(page, report);
      const before = (await download(page)).worksheets.map((w) => w.name);
      expect(before).toContain(report.sheetTitle.slice(0, 28));
      await page.getByTestId('report-download').click();
      await page.getByTestId(`sheet-${report.sheetGroup}`).click();
      await expect(page.getByTestId(`column-group-${report.sheetGroup}`)).toContainText('مش هتظهر');
      const after = (await download(page)).worksheets.map((w) => w.name);
      expect(after).not.toContain(report.sheetTitle.slice(0, 28));
      expect(after).toHaveLength(before.length - 1);
    });
  }
}
