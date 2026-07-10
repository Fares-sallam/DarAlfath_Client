import { test, expect } from '@playwright/test';

test.describe('صفحة الكتب والبحث', () => {
  test('صفحة الكتب تعرض الكتالوج', async ({ page }) => {
    await page.goto('/books');
    await expect(page.getByRole('heading', { name: 'كل كتب دار الفتح في مكان واحد' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^فتح صفحة/ }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('البحث من الهيدر ينتقل لصفحة الكتب بنتائج', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('ابحث عن كتاب، مؤلف، أو تصنيف...').fill('يبسبس');
    await page.getByPlaceholder('ابحث عن كتاب، مؤلف، أو تصنيف...').press('Enter');

    await page.waitForURL(/\/books\?q=/);
    await expect(page.getByRole('button', { name: /^فتح صفحة/ }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('بحث بكلمة غير موجودة يعرض رسالة لا توجد نتائج', async ({ page }) => {
    await page.goto('/books?q=xyzxyzxyz-nonexistent-book-title');
    await expect(page.getByText('لا توجد نتائج')).toBeVisible({ timeout: 10_000 });
  });
});
