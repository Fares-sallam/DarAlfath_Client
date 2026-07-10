import { test, expect } from '@playwright/test';

test('إدارة الشحن: الصفحة تُحمَّل بدون خطأ', async ({ page }) => {
  await page.goto('/shipping');
  await expect(page.getByRole('main').getByRole('heading', { name: 'إدارة الشحن' })).toBeVisible({ timeout: 15_000 });

  await expect(page.getByText('تعذّر تحميل بيانات الشحن')).toHaveCount(0, { timeout: 15_000 });
});
