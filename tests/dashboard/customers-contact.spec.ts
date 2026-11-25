import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «إدارة العملاء» and «إدارة الطلبات»: the phone number with a copy button and a call button, a WhatsApp button that really opens a chat
// (the app on a phone, WhatsApp Web / the desktop app on a computer), and a print button that opens the order's invoice. Hermetic: no real
// sign-in, every Supabase call is answered here.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const EG = 'c-eg';
const profile = (over: Record<string, unknown>) => ({
  id: 'u', full_name: 'عميل', email: null, phone: null, role: 'user', country_id: EG, avatar_url: null, is_active: true,
  created_at: '2026-11-20T10:00:00Z', updated_at: '2026-11-20T10:00:00Z', ...over,
});
const PROFILES = [
  profile({ id: 'u1', full_name: 'عميل تجريبي', email: 'salem@example.com', phone: '01099887766' }),
  profile({ id: 'u2', full_name: 'عميل بلا هاتف', email: 'nophone@example.com' }),
  profile({ id: 'u3', full_name: 'عميل بلا طلبات', email: 'noorders@example.com', phone: '٠١٠٥٥٤٤٣٣٢٢' }),
];
const aggOrder = (id: string, user_id: string | null, created_at: string, over: Record<string, unknown> = {}) => ({
  id, user_id, total_price: 100, created_at, country_id: EG, shipping_address: { name: 'اسم', phone: '01000000000', city: 'القاهرة' }, ...over,
});
const AGG_ORDERS = [
  aggOrder('ORD-OLD', 'u1', '2026-11-21T10:00:00Z', { total_price: 150 }),
  aggOrder('ORD-NEW', 'u1', '2026-11-25T10:00:00Z', { total_price: 320 }),
  aggOrder('ORD-GUEST', null, '2026-11-25T15:22:52Z', { total_price: 560, shipping_address: { name: 'Test Guest Customer', email: 'guest@example.com', phone: '01012345678', city: 'مدينة نصر', governorate: 'القاهرة' } }),
];
const detail = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: null, country_id: EG, status: 'جديد', total_price: 585, shipping_cost: 35, discount_amount: 0, payment_status: 'معلق',
  shipping_address: { name: 'Test Guest Customer', email: 'guest@example.com', phone: '01012345678', governorate: 'القاهرة', city: 'مدينة نصر', street: 'شارع الاختبار 1', country: 'مصر' },
  created_at: '2026-11-25T15:22:52Z', updated_at: '2026-11-25T15:22:52Z', profiles: null,
  countries: { name: 'مصر', currency_symbol: 'ج.م' }, coupons: null, payment_methods: { method_name: 'الدفع عند الاستلام' }, shipping_companies: null,
  order_items: [
    { id: 'i1', product_id: 'p1', variant_id: 'v1', quantity: 7, price_per_item: 20, discount_per_item: 0, is_digital: false, products: { id: 'p1', title: 'قواعد النحو', author: 'م', type: 'ورقي' }, product_variants: { id: 'v1', variant_name: 'غلاف فاخر' } },
    { id: 'i2', product_id: 'p2', variant_id: 'v2', quantity: 2, price_per_item: 50, discount_per_item: 5, is_digital: true, products: { id: 'p2', title: 'موسوعة الإملاء', author: 'م', type: 'رقمي' }, product_variants: { id: 'v2', variant_name: 'نسخة رقمية' } },
  ],
  ...over,
});

async function setUp(page: Page) {
  const requested: string[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    const url = decodeURIComponent(req.url());
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fallback();
    if (url.includes('/rest/v1/profiles')) return json(route, PROFILES);
    if (url.includes('/rest/v1/countries')) return json(route, [{ id: EG, name: 'مصر', currency_symbol: 'ج.م', code: 'EG' }]);
    if (url.includes('/rest/v1/orders')) {
      // one order with everything (the invoice), the short list of a customer's orders (the picker), or the totals the page is built from
      const one = /[?&]id=eq\.([^&]+)/.exec(url);
      if (one && url.includes('order_items')) {
        requested.push(one[1]);
        return json(route, detail(one[1]));
      }
      if (/[?&]id=in\./.test(url)) {
        return json(route, [
          { id: 'ORD-NEW', created_at: '2026-11-25T10:00:00Z', total_price: 320, status: 'جديد' },
          { id: 'ORD-OLD', created_at: '2026-11-21T10:00:00Z', total_price: 150, status: 'تم التسليم' },
        ]);
      }
      if (url.includes('product_variants')) return json(route, detail('ORD-20260101-test01'));
      return json(route, AGG_ORDERS);
    }
    return json(route, []);
  });
  return { requested };
}

/** What the invoice's print window shows: read as soon as it opens, started before the click. */
async function invoiceText(page: Page, action: () => Promise<void>): Promise<string> {
  const text = page.evaluate(async () => {
    for (let i = 0; i < 120; i++) {
      const frame = document.querySelector('iframe[data-print-frame]') as HTMLIFrameElement | null;
      const content = frame?.contentDocument?.body?.innerText;
      if (content) return content;
      await new Promise((r) => setTimeout(r, 50));
    }
    return '';
  });
  await action();
  return text;
}

const row = (page: Page, name: string) => page.locator('tbody tr', { hasText: name });

test('رقم الهاتف ومعاه زرين: نسخ الرقم، واتصال بالعميل (tel: بالرقم الدولي)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setUp(page);
  await page.goto('/customers');
  const salem = row(page, 'عميل تجريبي');
  await expect(salem).toBeVisible({ timeout: 20_000 });
  await expect(salem.getByTestId('phone-number')).toHaveText('01099887766');
  await expect(salem.getByTestId('phone-call')).toHaveAttribute('href', 'tel:+201099887766');

  await salem.getByTestId('phone-copy').click();
  await expect(page.getByText('تم نسخ رقم الهاتف')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('+201099887766');

  // Arabic-Indic digits are understood too; a customer without a number has no buttons at all
  await expect(row(page, 'عميل بلا طلبات').getByTestId('phone-call')).toHaveAttribute('href', 'tel:+201055443322');
  await expect(row(page, 'عميل بلا هاتف').getByTestId('phone-actions')).toHaveCount(0);
});

test('زرار الواتساب: بيفتح محادثة مع العميل برقمه الدولي ورسالة جاهزة، ومن غير رقم بيبقى مقفول برسالة واضحة', async ({ page }) => {
  await setUp(page);
  await page.goto('/customers');
  const link = row(page, 'عميل تجريبي').getByTestId('whatsapp-link');
  await expect(link).toBeVisible({ timeout: 20_000 });
  const href = (await link.getAttribute('href'))!;
  expect(href.startsWith('https://wa.me/201099887766?text=')).toBe(true);
  expect(decodeURIComponent(href.split('text=')[1])).toContain('عميل تجريبي');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);

  const none = row(page, 'عميل بلا هاتف').getByTestId('whatsapp-disabled');
  await none.click();
  await expect(page.getByText('مفيش رقم هاتف صالح للعميل ده')).toBeVisible();
});

test('الفاتورة: عميل ليه طلب واحد بتتطبع على طول، وفيها العميل والعنوان والأصناف والإجمالي بالشحن وبدونه', async ({ page }) => {
  const { requested } = await setUp(page);
  await page.goto('/customers');
  const guest = row(page, 'Test Guest Customer');
  await expect(guest).toBeVisible({ timeout: 20_000 });
  const text = await invoiceText(page, () => guest.getByTestId('invoice-button').click());
  expect(requested).toEqual(['ORD-GUEST']);
  for (const part of ['فاتورة', 'ORD-GUEST', 'Test Guest Customer', '01012345678', 'guest@example.com', 'القاهرة', 'قواعد النحو', 'غلاف فاخر', 'موسوعة الإملاء', 'رقمي', 'ورقي', 'الإجمالي بدون الشحن', 'الإجمالي بالشحن', 'الشحن']) {
    expect(text).toContain(part);
  }
  // 7 × 20 = 140 and 2 × (50 − 5) = 90; the order's own totals: 550 without shipping, 585 with it
  for (const amount of ['140 ج.م', '90 ج.م', '550 ج.م', '585 ج.م', '35 ج.م']) expect(text).toContain(amount);
});

test('عميل ليه أكتر من طلب: قايمة بالأحدث الأول، واختيار طلب بيطبع فاتورته هو', async ({ page }) => {
  const { requested } = await setUp(page);
  await page.goto('/customers');
  const salem = row(page, 'عميل تجريبي');
  await expect(salem).toBeVisible({ timeout: 20_000 });
  await salem.getByTestId('invoice-button').click();
  const picks = page.getByTestId('invoice-pick');
  await expect(picks).toHaveCount(2);
  await expect(picks.nth(0)).toContainText('ORD-NEW');
  await expect(picks.nth(1)).toContainText('ORD-OLD');
  const text = await invoiceText(page, () => picks.nth(1).click());
  expect(requested).toEqual(['ORD-OLD']);
  expect(text).toContain('ORD-OLD');
  await expect(page.getByTestId('invoice-picker')).toHaveCount(0);
});

test('عميل من غير طلبات: رسالة واضحة بدل فاتورة فاضية', async ({ page }) => {
  await setUp(page);
  await page.goto('/customers');
  await row(page, 'عميل بلا طلبات').getByTestId('invoice-button').click();
  await expect(page.getByText('لسه ما عملش طلبات، فمفيش فاتورة')).toBeVisible();
});

test('إدارة العملاء: الضغط في أي مكان على شريط العميل بيفتح ملفه، وأزرار الصف بتعمل شغلها هي بس', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setUp(page);
  await page.goto('/customers');
  const salem = row(page, 'عميل تجريبي');
  await expect(salem).toBeVisible({ timeout: 20_000 });
  const profileWindow = () => page.locator('.fixed.inset-0').last().getByText('الملف الشرائي للعميل');

  // a click on a plain cell opens the profile
  await salem.locator('td').first().click();
  await expect(profileWindow()).toBeVisible();
  await page.locator('.fixed.inset-0').last().locator('button').first().click();
  await expect(profileWindow()).toHaveCount(0);

  // from the keyboard
  await salem.focus();
  await page.keyboard.press('Enter');
  await expect(profileWindow()).toBeVisible();
  await page.locator('.fixed.inset-0').last().locator('button').first().click();
  await expect(profileWindow()).toHaveCount(0);

  // the buttons in the row do their own job and leave the profile closed: copy the number, the invoice picker
  await salem.getByTestId('phone-copy').click();
  await expect(page.getByText('تم نسخ رقم الهاتف')).toBeVisible();
  await expect(profileWindow()).toHaveCount(0);
  await salem.getByTestId('invoice-button').click();
  await expect(page.getByTestId('invoice-picker')).toBeVisible();
  await expect(profileWindow()).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('ملف العميل: واتساب وطباعة الفاتورة شغالين، والرقم ومعاه النسخ والاتصال', async ({ page }) => {
  await setUp(page);
  await page.goto('/customers');
  const guest = row(page, 'Test Guest Customer');
  await expect(guest).toBeVisible({ timeout: 20_000 });
  await guest.getByTitle('الملف الشرائي').click();
  const modal = page.locator('.fixed.inset-0').last();
  await expect(modal.getByTestId('phone-call')).toHaveAttribute('href', 'tel:+201012345678');
  await expect(modal.getByTestId('whatsapp-link')).toHaveAttribute('href', /^https:\/\/wa\.me\/201012345678\?text=/);
  const text = await invoiceText(page, () => modal.getByTestId('invoice-button').click());
  expect(text).toContain('ORD-GUEST');
});

test('تفاصيل الطلب: النافذة بتفتح من غير شاشة بيضاء والتفاصيل لسه بتتحمّل، وبعد التحميل الطباعة والواتساب شغالين', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setUp(page);
  // the details come late: the window is drawn first with nothing loaded (registered after setUp, so it answers first)
  await page.route('**/rest/v1/orders**', async (route) => {
    const url = decodeURIComponent(route.request().url());
    if (/[?&]id=eq\.[^&]+/.test(url) && url.includes('order_items')) {
      await new Promise((r) => setTimeout(r, 1_500));
      return json(route, detail('ORD-GUEST'));
    }
    return route.fallback();
  });
  await page.goto('/orders');
  await page.getByTitle('عرض التفاصيل').first().click({ timeout: 20_000 });

  const modal = page.locator('.fixed.inset-0').last();
  await expect(modal.getByText('تفاصيل الطلب')).toBeVisible();
  await expect(modal.getByText('جارٍ تحميل التفاصيل')).toBeVisible();
  await expect(modal.getByTestId('order-print')).toBeDisabled();
  expect(errors).toEqual([]);

  await expect(modal.getByText('قواعد النحو')).toBeVisible({ timeout: 10_000 });
  await expect(modal.getByTestId('order-print')).toBeEnabled();
  await expect(modal.getByTestId('whatsapp-link').last()).toHaveAttribute('href', /^https:\/\/wa\.me\/201012345678\?text=/);
  const text = await invoiceText(page, () => modal.getByTestId('order-print').click());
  expect(text).toContain('ORD-GUEST');
  expect(errors).toEqual([]);
});

test('صفحة الطلبات: الضغط في أي مكان على شريط الطلب بيفتح تفاصيله، وأزرار الصف بتعمل شغلها هي بس', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setUp(page);
  await page.goto('/orders');
  const rows = page.getByTestId('order-row');
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  const detailsWindow = () => page.locator('.fixed.inset-0').last().getByText('تفاصيل الطلب', { exact: true });

  // a click on a plain cell (the date, nothing clickable in it)
  await rows.first().locator('td').nth(-2).click();
  await expect(detailsWindow()).toBeVisible();
  await page.locator('.fixed.inset-0').last().locator('button').first().click();
  await expect(detailsWindow()).toHaveCount(0);

  // on the order number, and from the keyboard
  await rows.first().locator('td').first().click();
  await expect(detailsWindow()).toBeVisible();
  await page.locator('.fixed.inset-0').last().locator('button').first().click();
  await expect(detailsWindow()).toHaveCount(0);
  await rows.first().focus();
  await page.keyboard.press('Enter');
  await expect(detailsWindow()).toBeVisible();
  await page.locator('.fixed.inset-0').last().locator('button').first().click();
  await expect(detailsWindow()).toHaveCount(0);

  // the print button in the row prints; it does not also open the details
  const text = await invoiceText(page, () => rows.first().getByTestId('order-row-print').click());
  expect(text).toContain('فاتورة');
  await expect(detailsWindow()).toHaveCount(0);

  // dragging over the order number to select it (to copy it) does not open the details
  const number = await rows.first().locator('td').first().locator('span').boundingBox();
  await page.mouse.move(number!.x + 1, number!.y + number!.height / 2);
  await page.mouse.down();
  await page.mouse.move(number!.x + number!.width - 1, number!.y + number!.height / 2, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
  await expect(detailsWindow()).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('صفحة الطلبات: واتساب وطباعة الفاتورة في الصف مش مجرد رسالة، بيفتحوا الحقيقي', async ({ page }) => {
  await setUp(page);
  await page.goto('/orders');
  const printButton = page.getByTestId('order-row-print').first();
  await expect(printButton).toBeVisible({ timeout: 20_000 });
  const whatsapp = page.getByTestId('whatsapp-link').first();
  await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/20\d+\?text=/);
  const text = await invoiceText(page, () => printButton.click());
  expect(text).toContain('فاتورة');
  expect(text).toContain('الإجمالي بالشحن');
});
