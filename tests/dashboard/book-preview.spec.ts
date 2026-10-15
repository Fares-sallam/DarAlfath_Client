import { test, expect, type Page } from '../fixtures';

// "معاينة في المتجر" on each book row (where the dead "الأداء" button was) and "معاينة الكتاب" at the
// top of the edit form. The store is not opened: window.open is recorded instead. Every write is blocked.
test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    return method === 'GET' || method === 'HEAD' ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url?: string | URL) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
});

const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
const BOOK_URL = /^https:\/\/[^/]+\/book\/[0-9a-f-]{36}$/;

const activeRow = (page: Page) =>
  page.locator('tbody tr').filter({ has: page.locator('.status-badge', { hasText: 'نشط' }) }).first();

test('جدول الكتب: زرار «الأداء» اتشال، ومكانه معاينة الكتاب في المتجر', async ({ page }) => {
  await page.goto('/books');
  const row = activeRow(page);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTitle('الأداء')).toHaveCount(0);

  await row.getByTitle('معاينة في المتجر').click();
  const urls = await opened(page);
  expect(urls).toHaveLength(1);
  expect(urls[0]).toMatch(BOOK_URL);

  // A hidden book isn't on the store: it says so instead of opening a "not found" page.
  const hidden = page.locator('tbody tr').filter({ has: page.locator('.status-badge', { hasText: 'مخفي' }) }).first();
  if (await hidden.count()) {
    await hidden.getByTitle('الكتاب مخفي، مش ظاهر في المتجر').click();
    await expect(page.getByText('الكتاب ده مخفي، فمش هيظهر في المتجر لحد ما تفعّله.')).toBeVisible();
    expect(await opened(page)).toHaveLength(1);
  }
});

test('نافذة التعديل: «معاينة الكتاب» بتفتح صفحته، ولو فيه تعديل لسه ما اتحفظش بتسأل الأول', async ({ page }) => {
  await page.goto('/books');
  const row = activeRow(page);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByTitle('تعديل').click();

  const preview = page.getByRole('button', { name: 'معاينة الكتاب' });
  await expect(preview).toBeVisible();
  let asked = 0;
  page.on('dialog', (dialog) => {
    asked += 1;
    void dialog.dismiss();
  });

  // Nothing changed yet: it opens straight away.
  await preview.click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  expect((await opened(page))[0]).toMatch(BOOK_URL);
  expect(asked).toBe(0);

  // An edit on screen that isn't saved: it asks, and "cancel" doesn't open anything.
  await page.getByText(/^(اسم الكتاب|اسم المجموعة)/).locator('xpath=following-sibling::input').fill('عنوان متغيّر للاختبار');
  await preview.click();
  await expect.poll(() => asked).toBe(1);
  expect(await opened(page)).toHaveLength(1);

  // Adding a new book has no page yet: no preview button.
  await page.getByRole('button', { name: 'إلغاء' }).click();
  await page.getByRole('button', { name: 'إضافة كتاب جديد' }).click();
  await expect(page.getByRole('button', { name: 'معاينة الكتاب' })).toHaveCount(0);
});
