import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Building a report only reads data, so these are safe against the live database.

const PAGES = [
  { path: '/analytics', title: 'تقرير التحليلات والأداء', file: 'تقرير-التحليلات' },
  { path: '/inventory', title: 'تقرير المخزون', file: 'تقرير-المخزون' },
  { path: '/books', title: 'تقرير الكتب', file: 'تقرير-الكتب' },
  { path: '/orders', title: 'تقرير الطلبات', file: 'تقرير-الطلبات' },
  { path: '/shipping', title: 'تقرير الشحن', file: 'تقرير-الشحن' },
  { path: '/coupons', title: 'تقرير الكوبونات', file: 'تقرير-الكوبونات' },
  { path: '/customers', title: 'تقرير العملاء', file: 'تقرير-العملاء' },
  { path: '/activity', title: 'تقرير سجل النشاط', file: 'تقرير-سجل-النشاط' },
];

async function download(page: Page, path: string, period: string, format: 'Excel' | 'CSV') {
  await page.goto(path);
  await page.getByRole('button', { name: 'تنزيل تقرير' }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: period, exact: true }).click();
  await panel.getByRole('radio', { name: new RegExp(format) }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    panel.getByRole('button', { name: 'تنزيل التقرير' }).click(),
  ]);
  return file;
}

for (const { path, title, file } of PAGES) {
  test(`${title}: التقرير الشامل ينزل بتاريخ التنزيل وبياناته`, async ({ page }) => {
    const csv = await download(page, path, 'شامل', 'CSV');
    expect(csv.suggestedFilename()).toMatch(new RegExp(`^${file}_شامل_تنزيل-\\d{4}-\\d{2}-\\d{2}-\\d{4}\\.csv$`));

    const bytes = await readFile((await csv.path())!);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.toString('utf8');
    expect(text).toContain(`"${title}"`);
    expect(text).toContain('"تاريخ التنزيل"');
    expect(text).not.toMatch(/Infinity|NaN|undefined/);
  });
}

test('تقرير Excel لفترة محددة ينزل كملف xlsx سليم', async ({ page }) => {
  const xlsx = await download(page, '/inventory', 'هذا الشهر', 'Excel');
  expect(xlsx.suggestedFilename()).toMatch(/^تقرير-المخزون_شهر-\d{4}-\d{2}_تنزيل-.+\.xlsx$/);
  const bytes = await readFile((await xlsx.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe('PK'); // xlsx is a zip
  expect(bytes.length).toBeGreaterThan(5_000);
});

test('فترة مخصصة معكوسة تُرفض قبل التنزيل', async ({ page }) => {
  await page.goto('/orders');
  await page.getByRole('button', { name: 'تنزيل تقرير' }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'فترة مخصصة' }).click();
  await panel.locator('input[type="date"]').first().fill('2026-09-20');
  await panel.locator('input[type="date"]').last().fill('2026-09-01');
  await expect(panel.getByText('تاريخ البداية يجب أن يكون قبل تاريخ النهاية')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'تنزيل التقرير' })).toBeDisabled();
});
