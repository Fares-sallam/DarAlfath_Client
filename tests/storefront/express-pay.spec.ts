import { test, expect, type Page, type Route } from '../fixtures';

// "شراء سريع" on a device that can pay with Apple Pay: checkout opens as one screen (the delivery details
// together), and "Apple Pay" sends the customer straight to Paymob's page with only Apple Pay on it. An
// Apple device is imitated by defining window.ApplePaySession, as Safari does. The payment functions are
// answered in flight, so no order is placed and no stock is held; the cart is a real book from the catalog.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

const PAY_URL = 'https://accept.paymob.com/unifiedcheckout/?test=express';

async function asAppleDevice(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { ApplePaySession: unknown }).ApplePaySession = { canMakePayments: () => true };
  });
}

/** Records what the page opens as a tab, and what address it sends that tab to (Safari's rule: open it in the tap). */
async function recordTabs(page: Page) {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __tabs: string[] }).__tabs = log;
    window.open = ((url?: string) => {
      log.push(`open ${url}`);
      const tab = {
        closed: false,
        opener: null as unknown,
        location: { set href(value: string) { log.push(`goto ${value}`); } },
        close() { tab.closed = true; log.push('close'); },
      };
      return tab as unknown as Window;
    }) as typeof window.open;
  });
  return () => page.evaluate(() => (window as unknown as { __tabs: string[] }).__tabs);
}

async function fakePaymentFunctions(page: Page) {
  const sent: { fn: string; body: Record<string, unknown> }[] = [];
  const record = (fn: string) => async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    sent.push({ fn, body: route.request().postDataJSON() });
    if (fn === 'initiate-paymob-payment') return json(route, { paymentUrl: PAY_URL, merchantOrderId: 'ORD-20261019-express', clientSecret: 'secret-express', amountCents: 25000 });
    return json(route, { status: 'success', orderId: 'ORD-PAID-EXPRESS' });
  };
  for (const fn of ['initiate-paymob-payment', 'check-paymob-transaction']) await page.route(`**/functions/v1/${fn}`, record(fn));
  return sent;
}

/** Quick buy on the first book that is sold in one edition and can be added from its card. */
async function quickBuyFirstBook(page: Page) {
  await page.goto('/books?sort=price-desc');
  const card = page.locator('article.book-card', { has: page.locator('.book-card__main', { hasText: 'أضف للسلة' }) }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.locator('.book-card__quick').click();
}

/** Where the store asks Cloudflare's "are you a person" check (the deployed site), a script can't send the order. */
async function skipBehindTurnstile(page: Page) {
  await page.waitForLoadState('networkidle');
  test.skip((await page.locator('.turnstile-box').count()) > 0, 'التحقق الأمني شغال هنا: الإرسال بيتجرب على نسخة التطوير');
}

async function fillExpressForm(page: Page) {
  const panel = page.getByTestId('express-pay');
  await panel.getByLabel('الاسم ثلاثيًا').fill('سارة محمود حسن');
  await panel.getByLabel('رقم الموبايل').fill('01012345678');
  await panel.locator('select[autocomplete="address-level1"]').selectOption('القاهرة');
  await panel.locator('select[autocomplete="address-level2"]').selectOption('مدينة نصر');
  await panel.getByLabel('العنوان بالتفصيل').fill('12 شارع التحرير، الدور 3');
}

test('على جهاز أبل: «شراء سريع» بيفتح الدفع في شاشة واحدة بدل 3 خطوات، وزرار Apple Pay هو اللي بيدفع', async ({ page }) => {
  await asAppleDevice(page);
  await quickBuyFirstBook(page);
  await expect(page).toHaveURL(/\/checkout\?express=applepay$/);

  await expect(page.getByRole('heading', { name: 'الدفع السريع عبر Apple Pay' })).toBeVisible({ timeout: 15_000 });
  const panel = page.getByTestId('express-pay');
  await expect(panel).toBeVisible();
  // Every delivery field is on this one screen, and no steps.
  for (const label of ['الاسم ثلاثيًا', 'رقم الموبايل', 'البريد الإلكتروني', 'العنوان بالتفصيل']) {
    await expect(panel.getByLabel(label)).toBeVisible();
  }
  await expect(panel.locator('select[autocomplete="address-level1"]')).toBeVisible(); // the governorate
  await expect(panel.locator('select[autocomplete="address-level2"]')).toBeVisible(); // the city
  await expect(page.getByRole('list', { name: 'خطوات إتمام الطلب' })).toHaveCount(0);
  await expect(page.getByTestId('apple-pay-button')).toBeVisible();
  await expect(page.getByTestId('apple-pay-button')).toHaveAttribute('lang', 'ar');
  // Safari can fill them from the customer's contact card.
  await expect(panel.getByLabel('الاسم ثلاثيًا')).toHaveAttribute('autocomplete', 'name');
  await expect(panel.getByLabel('رقم الموبايل')).toHaveAttribute('autocomplete', 'tel');
  await expect(panel.getByLabel('العنوان بالتفصيل')).toHaveAttribute('autocomplete', 'street-address');
});

test('مش جهاز أبل: «شراء سريع» بيفتح الدفع العادي بخطواته، وحتى لو الرابط فيه express', async ({ page }) => {
  await quickBuyFirstBook(page);
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('list', { name: 'خطوات إتمام الطلب' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('express-pay')).toHaveCount(0);

  await page.goto('/checkout?express=applepay');
  await expect(page.getByRole('list', { name: 'خطوات إتمام الطلب' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('express-pay')).toHaveCount(0);
  await expect(page.getByTestId('apple-pay-button')).toHaveCount(0);
});

test('الدفع السريع: بيفتح تبويب الدفع جوه الضغطة وبعدين يوجّهه لـ Paymob بطريقة Apple Pay، وبعد التأكيد بيظهر رقم الطلب', async ({ page }) => {
  await asAppleDevice(page);
  const tabs = await recordTabs(page);
  const sent = await fakePaymentFunctions(page);
  await quickBuyFirstBook(page);
  await expect(page.getByTestId('express-pay')).toBeVisible({ timeout: 15_000 });
  await skipBehindTurnstile(page);

  await fillExpressForm(page);
  await page.getByTestId('apple-pay-button').click();

  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('order-confirmed')).toContainText('ORD-PAID-EXPRESS');

  // The tab was opened empty first (while the tap was still being answered) and sent to Paymob afterwards.
  expect(await tabs()).toEqual(['open about:blank', `goto ${PAY_URL}`]);

  const init = sent.find((s) => s.fn === 'initiate-paymob-payment')!;
  expect(init.body.provider).toBe('paymob_apple_pay');
  expect(typeof init.body.paymentMethodId).toBe('string');
  expect(init.body.customer).toMatchObject({ fullName: 'سارة محمود حسن', phone: '01012345678', governorate: 'القاهرة', city: 'مدينة نصر', address: '12 شارع التحرير، الدور 3' });
  expect((init.body.items as unknown[]).length).toBe(1);
  expect(sent.find((s) => s.fn === 'check-paymob-transaction')!.body).toMatchObject({ merchantOrderId: 'ORD-20261019-express', clientSecret: 'secret-express' });
});

test('الدفع السريع: لو البيانات ناقصة الضغط على Apple Pay بيوري المطلوب وما بيبعتش حاجة', async ({ page }) => {
  await asAppleDevice(page);
  const sent = await fakePaymentFunctions(page);
  await quickBuyFirstBook(page);
  await expect(page.getByTestId('express-pay')).toBeVisible({ timeout: 15_000 });
  await skipBehindTurnstile(page);

  await page.getByTestId('apple-pay-button').click();
  const panel = page.getByTestId('express-pay');
  await expect(panel.getByText('اكتب اسمك.')).toBeVisible();
  await expect(panel.getByText('اكتب رقم الموبايل.')).toBeVisible();
  await expect(panel.getByText('اختر المحافظة.')).toBeVisible();
  await expect(panel.getByText('اكتب العنوان بالتفصيل.')).toBeVisible();
  await expect(panel.getByLabel('الاسم ثلاثيًا')).toBeFocused();
  expect(sent).toHaveLength(0);
});

test('«الدفع بطريقة أخرى»: بيرجع للخطوات وبياناتك محفوظة، عند أول خطوة لسه ناقصة', async ({ page }) => {
  await asAppleDevice(page);
  await quickBuyFirstBook(page);
  await expect(page.getByTestId('express-pay')).toBeVisible({ timeout: 15_000 });

  const panel = page.getByTestId('express-pay');
  await panel.getByLabel('الاسم ثلاثيًا').fill('سارة محمود حسن');
  await panel.getByLabel('رقم الموبايل').fill('01012345678');
  await page.getByRole('button', { name: 'الدفع بطريقة أخرى' }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByTestId('express-pay')).toHaveCount(0);
  // The details are in, so it opens on the address step; going back finds the name where it was left.
  await expect(page.getByTestId('checkout-step-2')).toBeVisible();
  await page.getByRole('list', { name: 'خطوات إتمام الطلب' }).getByRole('button', { name: /بياناتك/ }).click();
  await expect(page.getByLabel('الاسم ثلاثيًا')).toHaveValue('سارة محمود حسن');
});
