import { test, expect, type Page } from '@playwright/test';

// Gallery uploads in the book form. Nothing reaches the database or storage:
// file uploads and REST writes are answered with an empty success, and the
// requests are recorded so the test can read what *would* have been written.

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const files = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `extra-${i}.png`, mimeType: 'image/png', buffer: PNG }));

interface Insert { url: string; sort_order: number; is_primary: boolean; product_id: string }

async function fakeUploads(page: Page) {
  const inserts: Insert[] = [];
  const otherWrites: string[] = [];
  await page.route('**/storage/v1/object/**', (route) =>
    route.request().method() === 'GET' ? route.fallback() : route.fulfill({ json: { Key: 'product-images/fake', Id: 'fake' } }));
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request();
    // The book starts with an empty gallery — the case where the first upload used to become the cover.
    if (request.method() === 'GET' && request.url().includes('/rest/v1/product_images')) return route.fulfill({ json: [] });
    if (request.method() === 'GET' || request.method() === 'HEAD') return route.fallback();
    if (request.url().includes('/rest/v1/product_images') && request.method() === 'POST') inserts.push(JSON.parse(request.postData()!));
    else otherWrites.push(`${request.method()} ${request.url()}`);
    return route.fulfill({ status: 204 });
  });
  return { inserts, otherWrites };
}

async function openImagesTab(page: Page) {
  await page.goto('/books');
  const row = page.locator('tbody tr').filter({ hasNot: page.locator('span.bg-amber-100') }).filter({ has: page.getByTitle('تعديل') }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByTitle('تعديل').click();
  await page.getByRole('tab', { name: /الصور والملفات/ }).or(page.getByRole('button', { name: /الصور والملفات/ })).first().click();
  const cover = page.getByPlaceholder('https://...');
  await expect(cover).toBeVisible();
  return cover;
}

test('رفع صور للمعرض لا يغيّر الغلاف: الغلاف هو الأساسي والصور تتضاف بعده', async ({ page }) => {
  const { inserts, otherWrites } = await fakeUploads(page);
  const cover = await openImagesTab(page);
  const before = await cover.inputValue();
  test.skip(!before, 'الكتاب الأول مالوش غلاف');

  await expect(page.getByText('0 صورة مضافة')).toBeVisible();
  await page.locator('input[type="file"][multiple]').setInputFiles(files(2));
  await expect.poll(() => inserts.length).toBe(2);

  // Added in order, none of them flagged as the main image.
  expect(inserts.map((i) => i.sort_order)).toEqual([0, 1]);
  expect(inserts.every((i) => i.is_primary === false)).toBe(true);
  // The cover is exactly what it was, and nothing else was saved.
  await expect(cover).toHaveValue(before);
  expect(otherWrites).toEqual([]);
});

test('كتاب من غير غلاف: أول صورة ترفعها بس هي اللي تبقى الغلاف', async ({ page }) => {
  const { inserts } = await fakeUploads(page);
  const cover = await openImagesTab(page);
  await cover.fill('');
  await page.locator('input[type="file"][multiple]').setInputFiles(files(3));
  await expect.poll(() => inserts.length).toBe(3);

  expect(inserts.map((i) => i.is_primary)).toEqual([true, false, false]);
  await expect(cover).toHaveValue(inserts[0].url);
});
