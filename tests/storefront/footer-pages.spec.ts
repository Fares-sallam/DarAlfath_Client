import { test, expect } from '../fixtures';

test.describe('صفحات الفوتر', () => {
  test('سياستنا', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByRole('heading', { name: 'سياسات واضحة وتجربة موثوقة' })).toBeVisible();
  });

  test('صفحة «عنّا» اتحذفت: مفيش رابط ليها في الفوتر ولا الهيدر، ولو اتفتح رابطها قديمًا بتظهر «غير موجودة»', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.site-footer')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('a[href="/about"]')).toHaveCount(0);
    await expect(page.locator('.site-footer').getByRole('link', { name: 'عنّا' })).toHaveCount(0);
    await expect(page.locator('.site-header').getByRole('link', { name: 'عنّا' })).toHaveCount(0);

    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'الصفحة غير موجودة' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'دار الفتح للنشر والتوزيع' })).toHaveCount(0);
  });

  test('تواصل معنا', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'يسعدنا سماعك' })).toBeVisible();
  });
});
