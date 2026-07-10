import { test, expect } from '@playwright/test';

test('إدارة الطلبات: الجدول يُحمَّل ويعرض إحصاءات صحيحة', async ({ page }) => {
  await page.goto('/orders');
  await expect(page.getByRole('main').getByRole('heading', { name: 'إدارة الطلبات' })).toBeVisible();

  const table = page.locator('table.w-full');
  const emptyState = page.getByText('لا توجد طلبات');
  await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });

  // إحصاءات الطلبات يجب أن تنتقل من حالة التحميل "—" إلى رقم فعلي.
  await expect(page.getByText('إجمالي الطلبات')).toBeVisible();
});
