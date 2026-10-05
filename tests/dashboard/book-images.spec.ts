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

// ── A new book: the photos are picked first and uploaded when it is saved ──

interface Recorded { method: string; url: string; body: string | null }

/** Storage uploads and REST writes are answered with a fake success (a row with an id where one is expected). */
async function fakeSave(page: Page) {
  const calls: Recorded[] = [];
  await page.route('**/storage/v1/object/**', (route) => {
    if (route.request().method() === 'GET') return route.fallback();
    calls.push({ method: route.request().method(), url: decodeURIComponent(route.request().url()), body: null });
    return route.fulfill({ json: { Key: 'fake', Id: 'fake' } });
  });
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request();
    if (request.method() === 'GET' || request.method() === 'HEAD') return route.fallback();
    calls.push({ method: request.method(), url: decodeURIComponent(request.url()), body: request.postData() });
    const wantsOne = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return wantsOne ? route.fulfill({ status: 201, json: { id: '00000000-0000-4000-8000-000000000001' } }) : route.fulfill({ status: 204 });
  });
  return calls;
}

async function openNewBookMedia(page: Page) {
  await page.goto('/books');
  await page.getByRole('button', { name: 'إضافة كتاب جديد' }).click();
  await page.getByRole('button', { name: /الصور والملفات/ }).click();
}

const pending = (page: Page) => page.getByTestId('pending-image');

test('كتاب جديد: الصور المتعددة تتختار مرة واحدة، وتتحذف قبل الحفظ، ومفيش حاجة بتتبعت', async ({ page }) => {
  const calls = await fakeSave(page);
  await openNewBookMedia(page);

  await expect(page.getByText('لسه مفيش صور')).toBeVisible();
  await page.getByTestId('pending-images-input').setInputFiles(files(3));
  await expect(pending(page)).toHaveCount(3);
  await expect(page.getByText('3 صورة هتتضاف مع الكتاب')).toBeVisible();

  // Removing one of them, and adding more in a second go.
  await pending(page).first().hover();
  await pending(page).first().getByTitle('حذف').click();
  await expect(pending(page)).toHaveCount(2);
  await page.getByTestId('pending-images-input').setInputFiles(files(2));
  await expect(pending(page)).toHaveCount(4);

  // The cover has its own box and stays empty; nothing was uploaded or saved yet.
  await expect(page.getByPlaceholder('https://...')).toHaveValue('');
  expect(calls).toEqual([]);
});

/** Fills the smallest valid new book, picks the photos (and a cover unless told not to), and saves. */
async function saveNewBook(page: Page, { cover, photos }: { cover: boolean; photos: number }) {
  const calls = await fakeSave(page);
  await openNewBookMedia(page);
  if (cover) await page.locator('input[type="file"][accept="image/*"]:not([multiple])').first().setInputFiles(files(1)[0]);
  if (photos > 0) await page.getByTestId('pending-images-input').setInputFiles(files(photos));

  await page.getByRole('button', { name: /المعلومات الأساسية/ }).click();
  await page.getByPlaceholder('مثال: ذاكرة الجسد').fill('كتاب اختبار الصور');
  await page.getByPlaceholder('اسم المؤلف').fill('مؤلف اختبار');
  await page.getByRole('button', { name: /أنواع النسخ/ }).click();
  await page.getByRole('button', { name: 'إضافة نسخة' }).first().click();
  await page.getByPlaceholder('0.00').nth(1).fill('50'); // السعر الأساسي (the sale price follows it)
  await page.getByPlaceholder('0', { exact: true }).first().fill('5');

  await page.getByRole('button', { name: /^إضافة الكتاب/ }).click();
  await expect.poll(() => calls.some((c) => c.url.includes('/rest/v1/product_images') || c.url.includes('/rest/v1/product_series') || c.url.includes('/rest/v1/product_inventory')), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => calls.at(-1)?.url, { timeout: 15_000 }).toBeTruthy();
  await page.waitForTimeout(800);
  return calls;
}

const field = (calls: Recorded[], where: string) => calls.filter((c) => c.url.includes(where));

test('حفظ كتاب جديد: الغلاف غلاف، وباقي الصور بتترفع بعده ومحدش فيهم رئيسي', async ({ page }) => {
  const calls = await saveNewBook(page, { cover: true, photos: 3 });

  const uploads = field(calls, '/storage/v1/object/');
  expect(uploads.filter((u) => u.url.includes('/book-covers/'))).toHaveLength(1);
  expect(uploads.filter((u) => u.url.includes('/product-images/temp-'))).toHaveLength(3);

  const created = JSON.parse(field(calls, '/rest/v1/products').find((c) => c.method === 'POST')!.body!);
  expect(created.cover_url).toContain('/book-covers/covers/temp-'); // the cover, not a photo

  const rows = JSON.parse(field(calls, '/rest/v1/product_images').find((c) => c.method === 'POST')!.body!);
  expect(rows).toHaveLength(3);
  expect(rows.map((r: { sort_order: number }) => r.sort_order)).toEqual([0, 1, 2]);
  expect(rows.every((r: { is_primary: boolean; url: string }) => r.is_primary === false && r.url.includes('/product-images/temp-'))).toBe(true);
});

test('حفظ كتاب جديد من غير غلاف: أول صورة هي الغلاف', async ({ page }) => {
  const calls = await saveNewBook(page, { cover: false, photos: 2 });

  const created = JSON.parse(field(calls, '/rest/v1/products').find((c) => c.method === 'POST')!.body!);
  const rows = JSON.parse(field(calls, '/rest/v1/product_images').find((c) => c.method === 'POST')!.body!);
  expect(rows.map((r: { is_primary: boolean }) => r.is_primary)).toEqual([true, false]);
  expect(created.cover_url).toBe(rows[0].url);
});
