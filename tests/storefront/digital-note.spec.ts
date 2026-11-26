import { test, expect, type Page, type Route } from '../fixtures';
import { storefrontStorageKey } from '../support/session';

// A digital book is never downloaded from the website: it is read inside the app, with the account that bought it.
// The book page says so next to the buy button (only for a digital edition) and checkout says so before paying.
// Hermetic: the catalog and the sign-in are answered here, nothing is placed or paid.

const ID = '22222222-2222-4222-8222-222222222222';
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

const PRODUCT = {
  product_id: ID, title: 'كتاب اختبار النسخة الرقمية', author: 'مؤلف', category_slug: 'c', category_name: 'تصنيف', country_code: 'EG',
  min_price: 100, max_price: 150, starting_price: 100, images: [], variant_count: 2, is_bundle: false, created_at: '2020-01-01T00:00:00Z', currency_symbol: 'ج.م',
};
const edition = (id: string, name: string, type: string, digital: boolean, price: number) => ({
  variant_id: id, product_id: ID, variant_name: name, variant_type: type, price, old_price: price, new_price: price,
  is_digital: digital, is_available: true, available_stock: digital ? null : 20, country_code: 'EG', currency_symbol: 'ج.م',
});
const VARIANTS = [edition('v-paper', 'مقاس 24*17', 'مادي', false, 100), edition('v-digital', 'إلكتروني', 'رقمي', true, 149.99)];

async function serveCatalog(page: Page) {
  await page.route('**/rest/v1/storefront_appearance*', (route) => json(route, { id: 1 }));
  await page.route('**/rest/v1/products_public_catalog*', (route) => json(route, [PRODUCT]));
  await page.route('**/rest/v1/product_variants_public*', (route) => json(route, VARIANTS));
  await page.route('**/rest/v1/product_review_stats*', (route) => json(route, []));
  await page.route('**/rest/v1/product_images*', (route) => json(route, []));
}

const note = (page: Page) => page.getByTestId('book-digital-note');

test('صفحة الكتاب: جملة «بتتقرا في التطبيق بس» بتظهر مع النسخة الرقمية بس، ومش مع الورقية', async ({ page }) => {
  await serveCatalog(page);
  await page.goto(`/book/${ID}`);
  await expect(page.locator('.bk3-var').first()).toBeVisible({ timeout: 20_000 });

  await page.locator('.bk3-var', { hasText: 'مقاس 24*17' }).click();
  await expect(note(page)).toHaveCount(0);

  await page.locator('.bk3-var', { hasText: 'إلكتروني' }).click();
  await expect(note(page)).toBeVisible();
  await expect(note(page)).toContainText('داخل تطبيق دار الفتح فقط');
  await expect(note(page)).toContainText('بنفس حسابك');
  await expect(note(page)).toContainText('لا يوجد تحميل من الموقع');

  // back to paper: gone again
  await page.locator('.bk3-var', { hasText: 'مقاس 24*17' }).click();
  await expect(note(page)).toHaveCount(0);
});

const DIGITAL_ITEM = {
  key: `${ID}:v-digital:ج.م`, product_id: ID, variant_id: 'v-digital', title: PRODUCT.title, variant_name: 'إلكتروني', variant_type: 'رقمي',
  price: 149.99, quantity: 1, image: null, is_digital: true, available_stock: null, currency_symbol: 'ج.م', weight_kg: null,
};
const PAPER_ITEM = { ...DIGITAL_ITEM, key: `${ID}:v-paper:ج.م`, variant_id: 'v-paper', variant_name: 'مقاس 24*17', variant_type: 'مادي', price: 100, is_digital: false, available_stock: 20, weight_kg: 0.3 };

async function seedCart(page: Page, items: unknown[]) {
  await serveCatalog(page);
  await page.addInitScript((cart) => localStorage.setItem('daralfath_client_cart', JSON.stringify(cart)), items);
}

test('الدفع (زائر): تحذير الكتاب الرقمي بيقول إنه بيتقرا في التطبيق، من غير الكلام القديم عن التحميل', async ({ page }) => {
  await seedCart(page, [DIGITAL_ITEM]);
  await page.goto('/checkout');
  const warning = page.locator('.checkout-digital-note');
  await expect(warning).toBeVisible({ timeout: 20_000 });
  await expect(warning).toContainText('تُقرأ من حسابك داخل تطبيق دار الفتح');
  await expect(warning).not.toContainText('تُحمَّل');
  // the guest already has the warning; the separate note is for someone who can buy
  await expect(page.getByTestId('checkout-digital-read')).toHaveCount(0);
});

test('الدفع (مسجّل دخول): جملة القراءة في التطبيق بتظهر قبل الدفع لسلة فيها كتاب رقمي، ومش لسلة ورقية', async ({ page }) => {
  const url = process.env.VITE_SUPABASE_URL;
  test.skip(!url, 'VITE_SUPABASE_URL مش متضبط هنا');
  const user = { id: '33333333-3333-4333-8333-333333333333', aud: 'authenticated', role: 'authenticated', email: 'buyer@example.test', app_metadata: {}, user_metadata: {}, created_at: '2020-01-01T00:00:00Z' };
  const session = { access_token: 'a.b.c', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86_400, refresh_token: 'r', user };
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [storefrontStorageKey(url!), JSON.stringify(session)]);
  await page.route('**/auth/v1/**', (route) => (route.request().url().includes('/auth/v1/user') ? json(route, user) : json(route, {})));

  await seedCart(page, [DIGITAL_ITEM]);
  await page.goto('/checkout');
  const read = page.getByTestId('checkout-digital-read');
  await expect(read).toBeVisible({ timeout: 20_000 });
  await expect(read).toContainText('داخل تطبيق دار الفتح فقط');
  await expect(read).toContainText('بنفس هذا الحساب');
  await expect(page.locator('.checkout-digital-note')).toHaveCount(0);

  // a paper-only cart has nothing to say about reading
  const other = await page.context().newPage();
  await other.addInitScript(([key, value]) => localStorage.setItem(key, value), [storefrontStorageKey(url!), JSON.stringify(session)]);
  await other.route('**/auth/v1/**', (route) => (route.request().url().includes('/auth/v1/user') ? json(route, user) : json(route, {})));
  await seedCart(other, [PAPER_ITEM]);
  await other.goto('/checkout');
  await expect(other.locator('.checkout-page, main').first()).toBeVisible({ timeout: 20_000 });
  await expect(other.getByTestId('checkout-digital-read')).toHaveCount(0);
});
