import { expect, test } from '../fixtures';
import type { Route } from '@playwright/test';

test('رمز Turnstile يصل إلى secure-login', async ({ page }) => {
  test.skip(!process.env.VITE_TURNSTILE_SITE_KEY, 'شغّل الاختبار بمفتاح Turnstile تجريبي');

  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.turnstile={render:(_el,opts)=>{setTimeout(()=>opts.callback("test-captcha-token"),0);return "widget"},remove:()=>{}};',
    }),
  );

  let sentToken: string | undefined;
  await page.route('**/functions/v1/secure-login', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info' } });
    }
    sentToken = route.request().postDataJSON()?.captchaToken;
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: 'بيانات الدخول غير صحيحة.' }),
    });
  });

  await page.goto('/account');
  await page.getByPlaceholder('name@example.com').fill('reader@example.com');
  await page.getByPlaceholder('••••••••').fill('not-a-real-password');
  await page.locator('form.auth-card button[type="submit"]').click();
  await expect.poll(() => sentToken).toBe('test-captcha-token');
});

test('تعطل تحميل Turnstile لا يعلّق تسجيل الدخول', async ({ page }) => {
  test.skip(!process.env.VITE_TURNSTILE_SITE_KEY, 'شغّل الاختبار بمفتاح Turnstile تجريبي');
  await page.clock.install();
  let pendingScript: Route | null = null;
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', (route) => {
    pendingScript = route;
  });
  let loginRequested = false;
  await page.route('**/functions/v1/secure-login', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info' } });
    }
    loginRequested = true;
    return route.fulfill({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'تعذّر التحقق الأمني.' }) });
  });

  await page.goto('/account');
  await page.getByPlaceholder('name@example.com').fill('reader@example.com');
  await page.getByPlaceholder('••••••••').fill('not-a-real-password');
  await page.locator('form.auth-card button[type="submit"]').click();
  await expect.poll(() => pendingScript).not.toBeNull();
  await page.clock.fastForward(10_001);
  await expect.poll(() => loginRequested).toBe(true);
  await pendingScript?.abort();
});
