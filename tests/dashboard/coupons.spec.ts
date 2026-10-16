import { test, expect } from '../fixtures';

test('إدارة الكوبونات: القائمة تُحمَّل وتعرض الكوبونات النشطة', async ({ page }) => {
  await page.goto('/coupons');
  await expect(page.getByRole('main').getByRole('heading', { name: 'إدارة الكوبونات والخصم' })).toBeVisible();

  const emptyState = page.getByText('لا توجد كوبونات', { exact: true });
  await expect(emptyState).toHaveCount(0, { timeout: 15_000 });

  // كوبونات حقيقية معروفة يجب أن تظهر في القائمة.
  await expect(page.getByText('DARALFATH20')).toBeVisible({ timeout: 15_000 });
});

// ── Where a coupon works: the website, the app, or both ────────────────────────────────────────
// The coupons list is answered in flight and every write is answered in flight too: nothing is saved
// anywhere.

type Row = Record<string, unknown>;
const couponRow = (code: string, channel: string | undefined): Row => ({
  id: `id-${code}`, code, type: 'نسبة', value: 10, min_order: 0, max_uses: null, used_count: 0, product_id: null,
  country_id: null, user_id: null, valid_from: '2020-01-01T00:00:00Z', valid_to: null, is_active: true,
  created_at: '2026-10-01T00:00:00Z', ...(channel === undefined ? {} : { channel }),
  products: null, countries: null, profiles: null,
});

async function withCoupons(page: import('@playwright/test').Page, rows: Row[]) {
  const writes: { method: string; body: Row }[] = [];
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('**/rest/v1/coupons*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(rows) });
    }
    if (req.method() === 'OPTIONS') return route.fallback();
    const body = (req.postDataJSON() ?? {}) as Row;
    writes.push({ method: req.method(), body });
    const saved = { ...rows[0], ...body };
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return route.fulfill({ status: 201, contentType: 'application/json', headers: cors, body: JSON.stringify(single ? saved : [saved]) });
  });
  return writes;
}

test('الكوبونات: كل كوبون عليه شارة بمكان استخدامه، والفلتر بيفصل الموقع عن التطبيق', async ({ page }) => {
  await withCoupons(page, [couponRow('ALLX', 'all'), couponRow('WEBX', 'web'), couponRow('APPX', 'app'), couponRow('OLDX', undefined)]);
  await page.goto('/coupons');
  const card = (code: string) => page.locator('div.bg-white', { has: page.getByText(code, { exact: true }) }).last();
  await expect(page.getByText('APPX', { exact: true })).toBeVisible({ timeout: 15_000 });

  await expect(card('ALLX').getByTestId('coupon-channel')).toHaveText('الموقع والتطبيق');
  await expect(card('WEBX').getByTestId('coupon-channel')).toHaveText('الموقع فقط');
  await expect(card('APPX').getByTestId('coupon-channel')).toHaveText('التطبيق فقط');
  // A coupon saved before the column existed counts as both.
  await expect(card('OLDX').getByTestId('coupon-channel')).toHaveText('الموقع والتطبيق');

  const filter = page.getByLabel('تصفية حسب مكان الاستخدام');
  await filter.selectOption('app');
  await expect(page.getByTestId('coupon-channel')).toHaveCount(1);
  await expect(page.getByText('APPX', { exact: true })).toBeVisible();
  await expect(page.getByText('WEBX', { exact: true })).toHaveCount(0);

  await filter.selectOption('web');
  await expect(page.getByText('WEBX', { exact: true })).toBeVisible();
  await expect(page.getByText('APPX', { exact: true })).toHaveCount(0);

  await filter.selectOption('all');
  await expect(page.getByTestId('coupon-channel')).toHaveCount(2); // the two that work in both

  await filter.selectOption('الكل');
  await expect(page.getByTestId('coupon-channel')).toHaveCount(4);
});

test('إضافة كوبون: الاختيار الافتراضي «الموقع والتطبيق»، واختيار «التطبيق فقط» بيتحفظ مع الكوبون', async ({ page }) => {
  const writes = await withCoupons(page, [couponRow('ALLX', 'all')]);
  await page.goto('/coupons');
  await expect(page.getByText('ALLX', { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'إضافة كوبون', exact: true }).click();
  const group = page.getByRole('radiogroup', { name: 'يعمل في' });
  await expect(group.getByRole('radio', { name: 'الموقع والتطبيق' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('يعمل في الموقع وفي تطبيق آيفون وأندرويد.')).toBeVisible();

  await group.getByRole('radio', { name: 'التطبيق فقط' }).click();
  await expect(group.getByRole('radio', { name: 'التطبيق فقط' })).toHaveAttribute('aria-checked', 'true');
  await expect(group.getByRole('radio', { name: 'الموقع والتطبيق' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText(/لو كتبه عميل في الموقع يظهر له إنه خاص بالتطبيق/)).toBeVisible();

  await page.getByPlaceholder('SUMMER25').fill('ZZAPP10');
  await page.getByPlaceholder('مثال: 20').fill('10');
  await page.getByRole('button', { name: 'إضافة الكوبون', exact: true }).click();
  await expect.poll(() => writes.length).toBeGreaterThan(0);
  expect(writes.at(-1)!.body).toMatchObject({ code: 'ZZAPP10', channel: 'app' });
});

test('تعديل كوبون: بيفتح باختياره الحالي، وحفظه من غير تغيير بيسيبه زي ما هو', async ({ page }) => {
  const writes = await withCoupons(page, [couponRow('WEBX', 'web')]);
  await page.goto('/coupons');
  await expect(page.getByText('WEBX', { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'تعديل' }).first().click();
  const group = page.getByRole('radiogroup', { name: 'يعمل في' });
  await expect(group.getByRole('radio', { name: 'الموقع فقط' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect.poll(() => writes.length).toBeGreaterThan(0);
  expect(writes.at(-1)!.body).toMatchObject({ id: 'id-WEBX', channel: 'web' });
});
