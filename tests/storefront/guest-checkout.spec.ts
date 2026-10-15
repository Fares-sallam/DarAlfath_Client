import { test, expect, type Page, type Route } from '../fixtures';
import { fillCheckoutSteps, signIn } from './helpers';

// Checkout without an account, in three steps: details → address → payment. The order and payment
// functions are answered in flight, so no order is placed and no stock is held. The cart is put in the
// browser directly (a real book and edition from the catalog).

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

/** Puts a real edition into the cart via the book card's own button, then opens checkout. */
async function addPaperBookAndCheckout(page: Page) {
  await page.goto('/books?sort=price-desc');
  const add = page.locator('article.book-card .book-card__main', { hasText: 'أضف للسلة' }).first();
  await expect(add).toBeVisible({ timeout: 20_000 });
  await add.click();
  await page.goto('/checkout');
}

/** Records what checkout sends to the order functions, and answers for them. */
async function fakeOrderFunctions(page: Page, answers: { order?: (route: Route) => Promise<void> } = {}) {
  const sent: { fn: string; body: Record<string, unknown>; auth: string | undefined }[] = [];
  const record = (fn: string) => async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    sent.push({ fn, body: route.request().postDataJSON(), auth: route.request().headers()['authorization'] });
    if (fn === 'create-storefront-order') {
      if (answers.order) return answers.order(route);
      return json(route, { order: { id: 'ORD-TEST-0001', total_price: 250, created_at: new Date().toISOString(), countries: { name: 'مصر', currency_symbol: 'ج.م' } } });
    }
    if (fn === 'initiate-paymob-payment') {
      return json(route, { paymentUrl: 'https://accept.paymob.com/unifiedcheckout/?test=1', merchantOrderId: 'ORD-20261015-test', clientSecret: 'secret-test', amountCents: 25000 });
    }
    if (fn === 'check-paymob-transaction') return json(route, { status: 'success', orderId: 'ORD-PAID-0002' });
    return route.fallback();
  };
  for (const fn of ['create-storefront-order', 'initiate-paymob-payment', 'check-paymob-transaction']) {
    await page.route(`**/functions/v1/${fn}`, record(fn));
  }
  await page.addInitScript(() => {
    window.open = (() => null) as typeof window.open;
  });
  return sent;
}

test('زائر: الدفع عنده 3 خطوات من غير تسجيل دخول، وكل خطوة بتتأكد من بياناتها قبل اللي بعدها', async ({ page }) => {
  await fakeOrderFunctions(page);
  await addPaperBookAndCheckout(page);

  // No sign-in wall: the first step, with a way to sign in for those who want to.
  await expect(page.getByRole('heading', { name: 'سجّل الدخول لإتمام الطلب' })).toHaveCount(0);
  const stepper = page.getByRole('list', { name: 'خطوات إتمام الطلب' });
  await expect(stepper.getByRole('listitem')).toHaveCount(3);
  await expect(stepper.getByRole('button', { name: /بياناتك/ })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('link', { name: 'سجّل الدخول' })).toHaveAttribute('href', '/account?next=/checkout');
  await expect(page.getByRole('button', { name: 'تأكيد الطلب' })).toHaveCount(0);

  const step1 = page.getByTestId('checkout-step-1');
  await step1.getByRole('button', { name: /^التالي/ }).click();
  await expect(step1).toContainText('اكتب اسمك.');
  await expect(step1).toContainText('اكتب رقم الموبايل.');

  await step1.getByLabel('الاسم ثلاثيًا *').fill('محمد أحمد');
  await step1.getByLabel('رقم الموبايل *').fill('12345');
  await step1.getByLabel(/^البريد الإلكتروني/).fill('not-an-email');
  await step1.getByRole('button', { name: /^التالي/ }).click();
  await expect(step1).toContainText('اكتب الاسم ثلاثيًا');
  await expect(step1).toContainText('رقم الموبايل غير صحيح');
  await expect(step1).toContainText('البريد الإلكتروني غير صحيح.');

  // Arabic digits are fine; the email can be left empty.
  await step1.getByLabel('الاسم ثلاثيًا *').fill('محمد أحمد علي');
  await step1.getByLabel('رقم الموبايل *').fill('٠١٠١٢٣٤٥٦٧٨');
  await step1.getByLabel(/^البريد الإلكتروني/).fill('');
  // Jumping ahead to payment isn't allowed while the address is missing.
  await stepper.getByRole('button', { name: /الدفع/ }).click();
  await expect(page.getByTestId('checkout-step-2')).toBeVisible();
  const step2 = page.getByTestId('checkout-step-2');
  await expect(step2).toContainText('اختر المحافظة.');

  // Back keeps what was typed.
  await step2.getByRole('button', { name: 'رجوع' }).click();
  await expect(page.getByTestId('checkout-step-1').getByLabel('الاسم ثلاثيًا *')).toHaveValue('محمد أحمد علي');
  await page.getByTestId('checkout-step-1').getByRole('button', { name: /^التالي/ }).click();

  await step2.getByLabel('المحافظة *').selectOption('الجيزة');
  await expect(step2.getByLabel('المدينة *')).toBeEnabled();
  await step2.getByRole('button', { name: /^التالي/ }).click();
  await expect(step2).toContainText('اختر المدينة.');
  await expect(step2).toContainText('اكتب العنوان بالتفصيل.');
});

test('زائر يطلب دفع عند الاستلام: الطلب بيتبعت باسمه وموبايله (متوحّد) من غير إيميل، وبيشوف رقم الطلب', async ({ page }) => {
  const sent = await fakeOrderFunctions(page);
  await addPaperBookAndCheckout(page);
  await fillCheckoutSteps(page, { name: 'سارة محمود حسن', phone: '+20 101 234 5678' });

  const step3 = page.getByTestId('checkout-step-3');
  await expect(step3.locator('.checkout-recap')).toContainText('سارة محمود حسن');
  await expect(step3.locator('.checkout-recap')).toContainText('01012345678');
  await expect(step3.locator('.checkout-recap')).toContainText('القاهرة، مدينة نصر');
  await step3.getByRole('radio', { name: /الدفع عند الاستلام/ }).click();
  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();

  const confirmed = page.getByTestId('order-confirmed');
  await expect(confirmed).toBeVisible();
  await expect(confirmed).toContainText('ORD-TEST-0001');
  await expect(confirmed).toContainText('سنتواصل معك على رقم');
  await expect(confirmed).toContainText('01012345678');
  await expect(confirmed.getByRole('link', { name: 'عرض طلباتي' })).toHaveCount(0);

  const order = sent.find((s) => s.fn === 'create-storefront-order')!;
  expect(order.body.customer).toMatchObject({ fullName: 'سارة محمود حسن', phone: '01012345678', email: '', governorate: 'القاهرة', city: 'مدينة نصر' });
  expect(order.body.paymentType).toBe('cod');
  // The cart is emptied once the order is in.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('daralfath_client_cart') || '[]').length)).toBe(0);
});

test('زائر يدفع أونلاين (Paymob): بعد تأكيد الدفع بيشوف رقم الطلب من غير ما يحتاج حساب', async ({ page }) => {
  const sent = await fakeOrderFunctions(page);
  await addPaperBookAndCheckout(page);
  await fillCheckoutSteps(page, { email: 'guest@example.com' });
  await page.getByTestId('checkout-step-3').getByRole('radio', { name: /محفظة إلكترونية|بطاقة ائتمان/ }).first().click();
  await page.getByRole('button', { name: 'الدفع عبر Paymob' }).click();

  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('order-confirmed')).toContainText('ORD-PAID-0002');
  const init = sent.find((s) => s.fn === 'initiate-paymob-payment')!;
  expect(init.body.customer).toMatchObject({ phone: '01012345678', email: 'guest@example.com' });
  const check = sent.find((s) => s.fn === 'check-paymob-transaction')!;
  expect(check.body).toMatchObject({ merchantOrderId: 'ORD-20261015-test', clientSecret: 'secret-test' });
});

test('رفض السيرفر (طلبات كتير على نفس الرقم) بيظهر برسالته، والسلة بتفضل زي ما هي', async ({ page }) => {
  await fakeOrderFunctions(page, {
    order: (route) => json(route, { error: 'يوجد عدد كبير من الطلبات المفتوحة على رقم الهاتف هذا اليوم. تواصل معنا إذا كنت تحتاج طلبًا جديدًا.' }, 429),
  });
  await addPaperBookAndCheckout(page);
  await fillCheckoutSteps(page);
  await page.getByTestId('checkout-step-3').getByRole('radio', { name: /الدفع عند الاستلام/ }).click();
  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'يوجد عدد كبير من الطلبات المفتوحة' })).toBeVisible();
  await expect(page.getByTestId('order-confirmed')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('daralfath_client_cart') || '[]').length)).toBeGreaterThan(0);
});

test('زائر في سلته كتاب رقمي: لازم يسجّل دخول (أو يشيله من السلة)، ومفيش تكملة', async ({ page }) => {
  await fakeOrderFunctions(page);
  await page.goto('/');
  // A digital edition in the cart, as the store saves one.
  await page.evaluate(() => {
    localStorage.setItem('daralfath_client_cart', JSON.stringify([{
      key: 'p:v:EG', product_id: '00000000-0000-4000-8000-000000000001', variant_id: '00000000-0000-4000-8000-000000000002',
      title: 'كتاب رقمي للاختبار', variant_name: 'إلكتروني', variant_type: 'رقمي', price: 50, quantity: 1, image: null,
      is_digital: true, available_stock: null, currency_symbol: 'ج.م', weight_kg: null,
    }]));
  });
  await page.route('**/rest/v1/product_variants_public*', (route) => json(route, [{ variant_id: '00000000-0000-4000-8000-000000000002', product_id: '00000000-0000-4000-8000-000000000001', is_available: true, is_digital: true }]));
  await page.goto('/checkout');
  const note = page.getByText('الكتب الرقمية تحتاج تسجيل الدخول');
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'تسجيل الدخول' }).first()).toHaveAttribute('href', '/account?next=/checkout');
  await expect(page.getByTestId('checkout-step-1').getByRole('button', { name: /^التالي/ })).toBeDisabled();
});

test('عميل مسجّل: الإيميل من حسابه، وبعد الطلب يقدر يفتح «طلباتي»', async ({ page }) => {
  const sent = await fakeOrderFunctions(page);
  await signIn(page);
  await addPaperBookAndCheckout(page);
  const step1 = page.getByTestId('checkout-step-1');
  await expect(step1.getByLabel(/^البريد الإلكتروني/)).not.toHaveValue('');
  await expect(page.getByRole('link', { name: 'سجّل الدخول' })).toHaveCount(0);
  await fillCheckoutSteps(page);
  await page.getByTestId('checkout-step-3').getByRole('radio', { name: /الدفع عند الاستلام/ }).click();
  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();
  await expect(page.getByTestId('order-confirmed').getByRole('link', { name: 'عرض طلباتي' })).toBeVisible();
  expect(sent.find((s) => s.fn === 'create-storefront-order')!.auth).toMatch(/^Bearer /);
});

test('تسجيل الدخول من صفحة الدفع بيرجّع العميل للدفع', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, 'حساب الاختبار غير مضبوط في .env.e2e');
  await page.goto('/account?next=/checkout');
  await page.getByPlaceholder('name@example.com').fill(email!);
  await page.getByPlaceholder('••••••••').fill(password!);
  await page.locator('form.auth-card button[type="submit"]').click();
  await expect(page).toHaveURL(/\/checkout$/, { timeout: 15_000 });
});

