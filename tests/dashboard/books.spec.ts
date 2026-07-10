import { test, expect } from '@playwright/test';

test('إدارة الكتب: الجدول يُحمَّل من قاعدة البيانات', async ({ page }) => {
  await page.goto('/books');
  await expect(page.getByRole('main').getByRole('heading', { name: 'إدارة الكتب' })).toBeVisible();

  const table = page.locator('table');
  const emptyState = page.getByText('لا توجد كتب');
  await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });
});
