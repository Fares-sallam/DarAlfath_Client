import { test, expect } from '@playwright/test';

// The catalog's covers are square (2048×2048) photos of a book on a grey
// backdrop. A portrait frame with object-fit: cover showed only the middle
// of the square and cut the sides off wide books, so covers are shown whole:
// a square frame, object-fit: contain. Pure CSS checks; read-only.

const fit = (el: Element) => getComputedStyle(el).objectFit;

test('كروت الكتب: إطار الغلاف مربع والصورة بتتعرض كاملة من غير قص', async ({ page }) => {
  await page.goto('/books', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.book-card__cover img').first()).toBeVisible({ timeout: 20_000 });

  const covers = await page.locator('.book-card__cover').evaluateAll((frames) =>
    frames
      .filter((frame) => frame.querySelector('img'))
      .map((frame) => {
        const box = frame.getBoundingClientRect();
        return { ratio: box.width / box.height, fit: getComputedStyle(frame.querySelector('img')!).objectFit };
      })
  );
  expect(covers.length).toBeGreaterThan(0);
  for (const cover of covers) {
    expect(cover.fit).toBe('contain');
    expect(cover.ratio).toBeCloseTo(1, 1);
  }
});

test('صفحة الكتاب: صورة الغلاف الأساسية بتتعرض كاملة', async ({ page }) => {
  await page.goto('/books', { waitUntil: 'domcontentloaded' });
  const first = page.getByRole('button', { name: /^فتح صفحة/ }).first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  await first.click();
  await page.waitForURL(/\/book\//);

  const frame = page.locator('.bk3-book');
  await expect(frame).toBeVisible({ timeout: 20_000 });
  const box = (await frame.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);
  await expect(page.locator('.bk3-book__cover img')).toHaveCSS('object-fit', 'contain');
});

test('كتب المجموعة: الغلاف الصغير بيتعرض كامل', async ({ page }) => {
  await page.goto('/books', { waitUntil: 'domcontentloaded' });
  const bundle = page
    .getByRole('button', { name: /^فتح صفحة/ })
    .filter({ has: page.locator('.book-card__badges', { hasText: 'مجموعة' }) })
    .first();
  await expect(bundle).toBeVisible({ timeout: 20_000 });
  await bundle.click();
  await page.waitForURL(/\/book\//);

  const covers = page.locator('.bk3-bundle__cover img');
  await expect(page.locator('.bk3-bundle__item').first()).toBeVisible({ timeout: 20_000 });
  test.skip((await covers.count()) === 0, 'مفيش غلاف في كتب المجموعة دي');
  expect(await covers.evaluateAll((imgs) => imgs.map((img) => getComputedStyle(img).objectFit))).toEqual(
    Array(await covers.count()).fill('contain')
  );
});
