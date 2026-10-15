import { test, expect, type Page } from '../fixtures';
import { qrDataUri } from '../../src/lib/qr';

// The book page's QR button: beside the heart and the share button, it opens a large code for the
// book's page. The code must lead to the same address the share button copies. Nothing is written
// anywhere.

async function openFirstBook(page: Page) {
  await page.goto('/');
  const firstBook = page.getByRole('button', { name: /^فتح صفحة/ }).first();
  await expect(firstBook).toBeVisible({ timeout: 20_000 });
  await firstBook.click();
  await page.waitForURL(/\/book\//);
  await expect(page.locator('.bk3-info__acts')).toBeVisible({ timeout: 20_000 });
}

const qrButton = (page: Page) => page.getByTestId('book-qr-button');
const dialog = (page: Page) => page.getByTestId('book-qr-dialog');
const closeButton = (page: Page) => dialog(page).getByRole('button', { name: 'إغلاق' });

test('زرار QR جنب القلب والمشاركة، وبيفتح كود كبير لنفس رابط الكتاب اللي المشاركة بتنسخه', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFirstBook(page);

  // Three buttons on one row.
  const row = await page.locator('.bk3-info__acts button').evaluateAll((buttons) =>
    buttons.map((b) => { const r = b.getBoundingClientRect(); return { y: Math.round(r.y), x: r.x }; }));
  expect(row).toHaveLength(3);
  expect(new Set(row.map((r) => r.y)).size).toBe(1);

  // What the share button copies is the book's address…
  await page.locator('.bk3-info__acts').getByRole('button', { name: /^مشاركة رابط/ }).click();
  await expect(page.locator('.site-toast')).toHaveText('تم نسخ رابط الكتاب');
  const bookUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(bookUrl).toMatch(/\/book\/[^/]+$/);

  // …and the code is that address, large.
  await qrButton(page).click();
  await expect(dialog(page)).toBeVisible();
  const image = page.getByTestId('book-qr-image');
  await expect(image).toBeVisible({ timeout: 10_000 });
  expect(await image.getAttribute('src')).toBe(await qrDataUri(bookUrl));
  const box = (await image.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(240);
  expect(Math.abs(box.width - box.height)).toBeLessThan(1);
  await expect(dialog(page)).toContainText('وجّه كاميرا هاتفك');

  // Dark modules on a white card, whatever the theme.
  expect(await page.locator('.bk3-qr__card').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
});

test('نافذة QR: Escape وضغطة الخلفية بيقفلوها، وضغطة على الكارت لأ، والتركيز بيرجع للزرار', async ({ page }) => {
  await openFirstBook(page);

  await qrButton(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(closeButton(page)).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden'); // the page behind doesn't scroll

  await page.locator('.bk3-qr__card').click();
  await expect(dialog(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(qrButton(page)).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

  await qrButton(page).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).click({ position: { x: 5, y: 5 } }); // the dimmed area, not the card
  await expect(dialog(page)).toBeHidden();

  await qrButton(page).click();
  await closeButton(page).click();
  await expect(dialog(page)).toBeHidden();
});
