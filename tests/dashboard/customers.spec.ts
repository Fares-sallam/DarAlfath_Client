import { test, expect } from '@playwright/test';

test('إدارة العملاء: القائمة تُحمَّل من قاعدة البيانات', async ({ page }) => {
  await page.goto('/customers');

  await expect(page.getByRole('main').getByRole('heading', { name: 'إدارة العملاء' })).toBeVisible();

  // بعد انتهاء التحميل: إما جدول عملاء فعلي أو رسالة "لا يوجد عملاء" — وليس تحميلاً أبديًا.
  const table = page.locator('table');
  const emptyState = page.getByText('لا يوجد عملاء');
  await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });
});
