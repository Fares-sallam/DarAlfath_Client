import { test, expect, type Page } from '@playwright/test';

// These open the book form and exercise it without saving. As a safety net
// against the live database, every write request is blocked: only reads go out.
test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    return method === 'GET' || method === 'HEAD' ? route.continue() : route.abort();
  });
});

const nameSelect = (page: Page) => page.locator('select:has(option[value="__custom__"])');

test('قائمة أسماء النسخ فيها «مقاس 24*17» و«مخصص» اللي بيفتح مربع للاسم', async ({ page }) => {
  await page.goto('/books');
  await page.getByRole('button', { name: 'إضافة كتاب جديد' }).click();
  await page.getByRole('button', { name: /أنواع النسخ/ }).click();
  await page.getByRole('button', { name: 'إضافة نسخة' }).click();

  const select = nameSelect(page).first();
  const options = await select.locator('option').allInnerTexts();
  expect(options).toEqual(expect.arrayContaining(['ورق عادي', 'مقاس 24*17', 'A4', 'كوشيه', 'إلكتروني', 'مخصص']));
  expect(options).not.toContain('ورق فاخر');

  await select.selectOption('__custom__');
  const custom = page.getByPlaceholder('اكتب اسم النوع');
  await expect(custom).toBeVisible();
  await custom.fill('غلاف مقوى');
  await expect(select).toHaveValue('__custom__');

  await select.selectOption('كوشيه');
  await expect(custom).toHaveCount(0);
  await page.getByRole('button', { name: 'إلغاء' }).click();
});

test('نسخ المجموعة: إضافة نسخة، ومنع اسمين متكررين، وحذف النسخة', async ({ page }) => {
  await page.goto('/books');
  const bundleRow = page.locator('tbody tr').filter({ has: page.locator('span.bg-amber-100', { hasText: 'مجموعة' }) }).first();
  await expect(bundleRow).toBeVisible({ timeout: 15_000 });
  await bundleRow.getByTitle('تعديل').click();
  await page.getByRole('button', { name: /نسخ المجموعة/ }).click();

  const chips = page.getByRole('tab');
  const before = await chips.count(); // 0 when the bundle has a single copy
  const firstName = await (async () => {
    const value = await nameSelect(page).inputValue();
    return value === '__custom__' ? page.getByPlaceholder('اكتب اسم النوع').inputValue() : value;
  })();

  await page.getByRole('button', { name: 'إضافة نسخة' }).click();
  await expect(chips).toHaveCount(Math.max(before, 1) + 1);
  await expect(chips.last()).toHaveAttribute('aria-selected', 'true');
  const presets = await nameSelect(page).locator('option').allInnerTexts();
  expect(presets).not.toContain('إلكتروني'); // bundles are paper only

  // Give the new copy the first copy's name: saving must refuse before any request.
  if (presets.includes(firstName)) {
    await nameSelect(page).selectOption(firstName);
  } else {
    await nameSelect(page).selectOption('__custom__');
    await page.getByPlaceholder('اكتب اسم النوع').fill(firstName);
  }
  await page.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByText(/فيه نسخة تانية بنفس الاسم/)).toBeVisible();

  await page.getByRole('button', { name: /حذف النسخة/ }).click();
  await expect(chips).toHaveCount(before);
  await page.getByRole('button', { name: 'إلغاء' }).click();
});
