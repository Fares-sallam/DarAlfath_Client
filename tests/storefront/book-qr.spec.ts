import { test, expect, type Page } from '../fixtures';
import { qrDataUri, qrSvgFromModules } from '../../src/lib/qr';

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

test('شكل الكود: الخانات الكبيرة في الأركان الثلاثة بحواف مدوّرة، والباقي مربعات عادية', () => {
  // A 25 x 25 grid with every module dark: the three finder zones (7 x 7) are drawn as rounded shapes, nothing else is.
  const svg = qrSvgFromModules(25, () => true);
  const arcs = svg.match(/a2\.1 2\.1 0 0 1/g) ?? [];
  expect(arcs).toHaveLength(3 * 4); // four rounded corners on each of the three outer rings
  expect(svg.match(/fill-rule="evenodd"/g)).toHaveLength(1);

  // The data modules path has no module inside the finder zones: top-left corner module (row 0, col 0) is not in it.
  const dataPath = /<path fill="#002046" d="([^"]*)"/.exec(svg)![1];
  expect(dataPath.startsWith('M9 2')).toBe(true); // first data module: row 0, col 7 → after the 7-module finder and the 2-module quiet zone
  expect(dataPath).not.toMatch(/^M2 2/);
});
