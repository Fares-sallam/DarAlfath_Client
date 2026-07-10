import { test, expect } from '@playwright/test';

test('سجل النشاط: يُحمَّل ويعرض تدقيقًا حقيقيًا (بدون خطأ تحميل)', async ({ page }) => {
  await page.goto('/activity');
  await expect(page.getByRole('main').getByRole('heading', { name: 'سجل النشاط' })).toBeVisible();

  const table = page.locator('table.w-full');
  const emptyState = page.getByText('لا توجد سجلات', { exact: true });
  await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });
});
