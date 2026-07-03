import { test, expect } from '@playwright/test';

test('لوحة التحليلات: مؤشرات الأداء (KPI) تُحمَّل من الطلبات الفعلية', async ({ page }) => {
  await page.goto('/analytics');

  await expect(page.getByRole('heading', { name: 'لوحة التحليلات الكاملة' })).toBeVisible();

  const revenueCard = page.locator('div.card-hover', { hasText: 'إجمالي الإيرادات' });
  const ordersCard = page.locator('div.card-hover', { hasText: 'إجمالي الطلبات' });
  await expect(revenueCard).toBeVisible({ timeout: 15_000 });
  await expect(ordersCard).toBeVisible();

  // بعد انتهاء التحميل يختفي هيكل التحميل (skeleton) وتظهر القيمة الفعلية.
  await expect(revenueCard.locator('.animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  await expect(ordersCard.locator('.animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  await expect(revenueCard.locator('p.text-2xl')).toBeVisible();
});
