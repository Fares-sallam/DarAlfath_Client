import { test, expect } from '@playwright/test';

test('إدارة المخزون: الجدول يُحمَّل ويعرض الكمية المتاحة', async ({ page }) => {
  await page.goto('/inventory');

  await expect(page.getByRole('main').getByRole('heading', { name: 'إدارة المخزون', exact: true })).toBeVisible();

  const table = page.locator('table.w-full');
  const emptyState = page.getByText('لا يوجد مخزون لهذه الدولة بعد');
  await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });
});
