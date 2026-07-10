import { test, expect } from '@playwright/test';

test('إدارة السلاسل: الصفحة تُحمَّل وتعرض الإحصاءات', async ({ page }) => {
  await page.goto('/series');
  await expect(page.getByRole('main').getByRole('heading', { name: 'إدارة السلاسل' })).toBeVisible();
  await expect(page.getByText('إجمالي السلاسل')).toBeVisible({ timeout: 15_000 });
});
