import { test, expect } from '@playwright/test';

test.describe('صفحة الكتب والبحث', () => {
  test('صفحة الكتب تعرض الكتالوج', async ({ page }) => {
    await page.goto('/books');
    await expect(page.getByRole('heading', { name: 'كل كتب دار الفتح في مكان واحد' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^فتح صفحة/ }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('البحث من الهيدر ينتقل لصفحة الكتب بنتائج', async ({ page }) => {
    // Searches for a word from a real title, so the test doesn't depend on
    // one particular book staying in the catalog.
    await page.goto('/books');
    const firstCard = page.getByRole('button', { name: /^فتح صفحة/ }).first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    const title = (await firstCard.getAttribute('aria-label'))!.replace(/^فتح صفحة\s*/, '');
    const term = title.split(/\s+/).find((w) => w.length >= 4) ?? title;

    await page.goto('/');
    await page.getByPlaceholder('ابحث عن كتاب، مؤلف، أو تصنيف...').fill(term);
    await page.getByPlaceholder('ابحث عن كتاب، مؤلف، أو تصنيف...').press('Enter');

    await page.waitForURL(/\/books\?q=/);
    await expect(page.getByRole('button', { name: `فتح صفحة ${title}` }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('بحث بكلمة غير موجودة يعرض رسالة لا توجد نتائج', async ({ page }) => {
    await page.goto('/books?q=xyzxyzxyz-nonexistent-book-title');
    await expect(page.getByText('لا توجد نتائج')).toBeVisible({ timeout: 10_000 });
  });
});
