import { test, expect } from '@playwright/test';

// اختبارات الدخول تبدأ من جلسة فارغة (بدون الاعتماد على storageState المشروع).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('لوحة التحكم — تسجيل الدخول', () => {
  test('بيانات خاطئة تعرض رسالة خطأ ولا تدخل اللوحة', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill('nonexistent-user@daralfath.test');
    await page.locator('input[name="password"]').fill('WrongPassword123!');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    // يظهر تنبيه خطأ (toast) عربي، ولا يُعاد التوجيه بعيدًا عن /login.
    await expect(page.getByText('البريد الإلكتروني أو كلمة المرور غير صحيحة')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test('بريد بلا @ يُرفض قبل إرسال الطلب (تحقق الحقل)', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.locator('input[name="email"]');
    await emailInput.fill('not-an-email');
    await page.locator('input[name="password"]').fill('whatever');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    // type="email" + required → المتصفح يمنع الإرسال ويُبقي التركيز على الحقل.
    const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(isValid).toBe(false);
    await expect(page).toHaveURL(/\/login/);
  });

  test('بيانات صحيحة (حساب اختبار) تدخل اللوحة بنجاح', async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL ?? '';
    const password = process.env.E2E_ADMIN_PASSWORD ?? '';
    test.skip(!email || !password, 'بيانات حساب الاختبار غير مضبوطة في .env.e2e');

    await page.goto('/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });
});
