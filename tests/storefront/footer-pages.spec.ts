import { test, expect } from '@playwright/test';

test.describe('صفحات الفوتر', () => {
  test('سياستنا', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByRole('heading', { name: 'سياسات واضحة وتجربة موثوقة' })).toBeVisible();
  });

  test('عنّا', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'دار الفتح للنشر والتوزيع' })).toBeVisible();
  });

  test('تواصل معنا', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'يسعدنا سماعك' })).toBeVisible();
  });
});
