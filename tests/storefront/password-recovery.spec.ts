import { expect, test, type Route } from '../fixtures';

const authHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
};

function reply(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: authHeaders,
    body: JSON.stringify(body),
  });
}

test('استعادة كلمة المرور ترسل Recovery OTP وتتحقق منه بالنوع الصحيح', async ({ page }) => {
  const recoveryRequests: Record<string, unknown>[] = [];
  const verificationRequests: Record<string, unknown>[] = [];
  let magicLinkRequests = 0;

  await page.route('**/auth/v1/recover**', (route) => {
    if (route.request().method() === 'OPTIONS') return reply(route, 200, {});
    recoveryRequests.push(route.request().postDataJSON());
    return reply(route, 200, {});
  });
  await page.route('**/auth/v1/otp**', (route) => {
    if (route.request().method() !== 'OPTIONS') magicLinkRequests += 1;
    return reply(route, 500, {});
  });
  await page.route('**/auth/v1/verify**', (route) => {
    if (route.request().method() === 'OPTIONS') return reply(route, 200, {});
    verificationRequests.push(route.request().postDataJSON());
    return reply(route, 400, { code: 'otp_expired', msg: 'Token has expired or is invalid' });
  });

  await page.goto('/account');
  await page.getByRole('button', { name: 'نسيت كلمة المرور؟' }).click();
  await page.getByLabel('البريد الإلكتروني').fill('reader@example.com');
  await page.getByRole('button', { name: 'إرسال كود التحقق' }).click();

  await expect(page.getByText('كود إعادة التعيين', { exact: true }).first()).toBeVisible();
  expect(recoveryRequests).toHaveLength(1);
  expect(recoveryRequests[0].email).toBe('reader@example.com');
  expect(magicLinkRequests).toBe(0);

  for (let i = 1; i <= 6; i += 1) {
    await page.getByRole('textbox', { name: `رقم ${i} من 6` }).fill(String(i));
  }
  await page.getByRole('button', { name: 'تأكيد الكود' }).click();

  await expect(page.locator('.auth-alert--error')).toBeVisible();
  expect(verificationRequests).toHaveLength(1);
  expect(verificationRequests[0]).toMatchObject({
    email: 'reader@example.com',
    token: '123456',
    type: 'recovery',
  });
});

test('حد البريد يوقف الاستعادة برسالة واضحة بدون ادعاء إرسال الكود', async ({ page }) => {
  await page.route('**/auth/v1/recover**', (route) => {
    if (route.request().method() === 'OPTIONS') return reply(route, 200, {});
    return reply(route, 429, {
      code: 'over_email_send_rate_limit',
      msg: 'email rate limit exceeded',
    });
  });

  await page.goto('/account');
  await page.getByRole('button', { name: 'نسيت كلمة المرور؟' }).click();
  await page.getByLabel('البريد الإلكتروني').fill('reader@example.com');
  await page.getByRole('button', { name: 'إرسال كود التحقق' }).click();

  await expect(page.locator('.auth-alert--error')).toContainText('بلوغ حد رسائل البريد');
  await expect(page.getByText('كود إعادة التعيين', { exact: true })).toHaveCount(0);
});

test('كود Recovery الصحيح يفتح تعيين كلمة المرور ويحفظها', async ({ page }) => {
  const user = {
    id: 'ca2445db-747f-45de-9f83-10733c807b29',
    email: 'reader@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  const accessToken = `e30.${payload}.test`;
  const passwordUpdates: Record<string, unknown>[] = [];

  await page.route('**/auth/v1/recover**', (route) => reply(route, 200, {}));
  await page.route('**/auth/v1/verify**', (route) => reply(route, 200, {
    access_token: accessToken,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user,
  }));
  await page.route('**/auth/v1/user**', (route) => {
    if (route.request().method() === 'PUT') {
      passwordUpdates.push(route.request().postDataJSON());
    }
    return reply(route, 200, user);
  });

  await page.goto('/account');
  await page.getByRole('button', { name: 'نسيت كلمة المرور؟' }).click();
  await page.getByLabel('البريد الإلكتروني').fill(user.email);
  await page.getByRole('button', { name: 'إرسال كود التحقق' }).click();
  for (let i = 1; i <= 6; i += 1) {
    await page.getByRole('textbox', { name: `رقم ${i} من 6` }).fill(String(i));
  }
  await page.getByRole('button', { name: 'تأكيد الكود' }).click();

  await expect(page.getByText('تعيين كلمة مرور جديدة', { exact: true })).toBeVisible();
  await page.getByLabel('كلمة المرور الجديدة').fill('new-pass-123');
  await page.getByLabel('تأكيد كلمة المرور').fill('new-pass-123');
  await page.getByRole('button', { name: 'حفظ كلمة المرور الجديدة' }).click();

  await expect.poll(() => passwordUpdates.length).toBe(1);
  expect(passwordUpdates[0].password).toBe('new-pass-123');
  await expect(page.getByText('أهلًا، reader')).toBeVisible();
});
