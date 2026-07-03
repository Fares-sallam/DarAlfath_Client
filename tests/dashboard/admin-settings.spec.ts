import { test, expect } from '@playwright/test';

test('إعدادات المشرفين: القائمة تُحمَّل وتعرض المشرفين الحاليين', async ({ page }) => {
  await page.goto('/admins');

  await expect(page.getByRole('main').getByRole('heading', { name: 'إعدادات المشرفين' })).toBeVisible();

  const emptyState = page.getByText('لا يوجد مشرفون');
  await expect(emptyState).toHaveCount(0, { timeout: 15_000 });

  // حساب الاختبار نفسه مضاف كمشرف — يجب أن يظهر ضمن القائمة (وليس فقط في شريط
  // المستخدم الحالي أعلى الصفحة، لذا نقصر البحث على محتوى الصفحة الرئيسي).
  await expect(page.getByRole('main').getByText('E2E Test Admin (Playwright)')).toBeVisible();
});
