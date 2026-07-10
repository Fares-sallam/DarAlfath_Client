import { test, expect } from '@playwright/test';

test('إدارة الكوبونات: القائمة تُحمَّل وتعرض الكوبونات النشطة', async ({ page }) => {
  await page.goto('/coupons');
  await expect(page.getByRole('main').getByRole('heading', { name: 'إدارة الكوبونات والخصم' })).toBeVisible();

  const emptyState = page.getByText('لا توجد كوبونات', { exact: true });
  await expect(emptyState).toHaveCount(0, { timeout: 15_000 });

  // كوبونات حقيقية معروفة يجب أن تظهر في القائمة.
  await expect(page.getByText('DARALFATH20')).toBeVisible({ timeout: 15_000 });
});
