import { test, expect } from '../fixtures';

// اختبارات الدخول تبدأ من جلسة فارغة (بدون الاعتماد على storageState المشروع).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('لوحة التحكم — تسجيل الدخول', () => {
  test('بيانات خاطئة تعرض رسالة خطأ ولا تدخل اللوحة', async ({ page }) => {
    // The sign-in goes through the secure-login function behind a Turnstile check a robot cannot pass, so this checks what the
    // page does with the function's answer: Cloudflare's script is blocked (the page goes on without a token) and the function
    // answers as it does for a wrong password.
    await page.route('**://challenges.cloudflare.com/**', (route) => route.abort());
    await page.route('**/functions/v1/secure-login', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }) }));
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

  test('التصميم: لوحة الهوية بالباترن واللوجو، وصفحة الدخول من غير سكرول أفقي على الموبايل', async ({ page }) => {
    await page.route('**://challenges.cloudflare.com/**', (route) => route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await expect(page.locator('.lg-brand')).toBeVisible();
    await expect(page.locator('.lg-brand__logo')).toBeVisible();
    // the logo and both patterns are real files (a missing one would be a blank panel)
    await expect.poll(() => page.locator('.lg-brand__logo').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    for (const file of ['/patterns/brand-pattern-night.svg', '/patterns/brand-pattern.svg']) {
      expect((await page.request.get(file)).ok(), file).toBe(true);
    }
    await expect(page.locator('.lg-brand__pattern')).toHaveCSS('background-image', /brand-pattern-night\.svg/);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.lg-brand')).toBeHidden(); // the panel is for wide screens; the logo sits above the card instead
    await expect(page.locator('.lg-mobile-logo')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const name of ['email', 'password']) await expect(page.locator(`input[name="${name}"]`)).toBeVisible();
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
    // needs Supabase's captcha protection to be off (a robot cannot pass it): the saved-session sign-in covers the signed-in tests
    test.skip(process.env.E2E_LOGIN_FORM !== '1', 'الدخول بالفورم محتاج الكابتشا مقفولة (E2E_LOGIN_FORM=1)');

    await page.goto('/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });
});
