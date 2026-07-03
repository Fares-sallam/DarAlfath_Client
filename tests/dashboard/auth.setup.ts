import { test as setup, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

const authFile = 'playwright/.auth/admin.json';

setup('تسجيل دخول لوحة التحكم (حساب اختبار مخصّص)', async ({ page }) => {
  expect(ADMIN_EMAIL, 'E2E_ADMIN_EMAIL مفقود من .env.e2e').not.toBe('');
  expect(ADMIN_PASSWORD, 'E2E_ADMIN_PASSWORD مفقود من .env.e2e').not.toBe('');

  await page.goto('/login');
  await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

  // بعد الدخول الناجح يُعاد التوجيه للصفحة الرئيسية للوحة.
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
