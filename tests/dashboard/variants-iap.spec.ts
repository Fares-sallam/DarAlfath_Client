import { test, expect, type Page } from '@playwright/test';

// The store product id (iap_product_id) on a digital copy, and the guarantee
// that saving a book updates its copies in place. Real books are read; every
// write is recorded and answered with a fake success (or a fake database
// error), so nothing is saved.

const STORE_ID = 'com.daralfath.store.book_learn_wudu_salah';
const LABEL = 'معرّف المنتج في App Store وGoogle Play';

interface Call { method: string; url: string; body: Record<string, unknown> | null }
interface Book { id: string; title: string; variants: { id: string; variant_type: string; sku: string | null }[] }
interface Books { digital: Book | null; physical: Book | null; multi: Book | null }

async function findBooks(page: Page): Promise<Books> {
  return page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const { data } = await supabase
      .from('products')
      .select('id, title, product_variants(id, variant_type, sku)')
      .eq('is_bundle', false)
      .eq('is_active', true);
    type Row = { id: string; title: string; product_variants: Book['variants'] };
    const rows = (data ?? []) as unknown as Row[];
    const titleCount = new Map<string, number>();
    for (const r of rows) titleCount.set(r.title.trim(), (titleCount.get(r.title.trim()) ?? 0) + 1);
    const pick = (test: (v: Book['variants']) => boolean): Book | null => {
      const r = rows.find((x) => titleCount.get(x.title.trim()) === 1 && x.product_variants.length > 0 && test(x.product_variants));
      return r ? { id: r.id, title: r.title.trim(), variants: r.product_variants } : null;
    };
    return {
      digital: pick((v) => v.some((x) => x.variant_type === 'رقمي')),
      physical: pick((v) => v.every((x) => x.variant_type === 'مادي')),
      multi: pick((v) => v.length >= 2 && v.every((x) => x.variant_type === 'مادي')),
    };
  });
}

/** Records writes and answers them like the database would for an unchanged save. */
async function fakeWrites(page: Page, opts: { failVariantDelete?: boolean; failVariantUpdate?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request();
    if (['GET', 'HEAD'].includes(request.method())) return route.fallback();
    const url = decodeURIComponent(request.url());
    const body = request.postData() ? (JSON.parse(request.postData()!) as Record<string, unknown>) : null;
    calls.push({ method: request.method(), url, body });

    if (opts.failVariantDelete && request.method() === 'DELETE' && url.includes('/rest/v1/product_variants')) {
      return route.fulfill({
        status: 409,
        json: {
          code: '23503',
          message: 'update or delete on table "product_variants" violates foreign key constraint "iap_purchases_variant_id_fkey" on table "iap_purchases"',
          details: 'Key (id)=(x) is still referenced from table "iap_purchases".',
        },
      });
    }
    if (opts.failVariantUpdate && request.method() === 'PATCH' && url.includes('/rest/v1/product_variants')) {
      return route.fulfill({ status: 409, json: opts.failVariantUpdate });
    }
    if ((request.headers()['accept'] ?? '').includes('vnd.pgrst.object')) {
      const id = /[?&]id=eq\.([0-9a-f-]{36})/.exec(url)?.[1] ?? '00000000-0000-4000-8000-000000000001';
      return route.fulfill({ status: request.method() === 'POST' ? 201 : 200, json: { id, ...body } });
    }
    return route.fulfill({ status: 204 });
  });
  return calls;
}

/** The book's list query, with a store id put on its first digital copy (the DB has none yet). */
async function withStoreId(page: Page, bookId: string, value: string) {
  await page.route('**/rest/v1/products?*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const json = await response.json();
    if (!Array.isArray(json) || !json.some((p) => 'product_variants' in p)) return route.fulfill({ response, json });
    for (const product of json as { id: string; product_variants?: { variant_type: string; iap_product_id?: string | null }[] }[]) {
      if (product.id !== bookId) continue;
      const digital = product.product_variants?.find((v) => v.variant_type === 'رقمي');
      if (digital) digital.iap_product_id = value;
    }
    return route.fulfill({ response, json });
  });
}

async function openVariants(page: Page, title: string) {
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('ابحث بالعنوان، المؤلف، ISBN...').fill(title);
  const row = page.locator('tbody tr').filter({ has: page.locator('span.truncate', { hasText: title }) }).first();
  await expect(row).toBeVisible();
  await row.getByTitle('تعديل').click();
  await page.getByRole('button', { name: /أنواع النسخ/ }).click();
}

/** order_items.count as the browser can read it (cross-origin: the header has to be exposed). */
const ordersCount = (n: number) => ({
  status: 200,
  headers: { 'content-range': `*/${n}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' },
  body: '',
});

const save = (page: Page) => page.getByRole('button', { name: /^حفظ التعديلات/ }).click();
const variantWrites = (calls: Call[], method?: string) =>
  calls.filter((c) => c.url.includes('/rest/v1/product_variants') && (!method || c.method === method));

test('نسخة رقمية: الحقل ظاهر بقيمته المحفوظة، والنسخ الورقية ملهاش الحقل', async ({ page }) => {
  await fakeWrites(page);
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const { digital } = await findBooks(page);
  test.skip(!digital, 'مفيش كتاب فيه نسخة رقمية');
  await withStoreId(page, digital!.id, STORE_ID);

  await openVariants(page, digital!.title);
  const field = page.getByLabel(LABEL);
  const digitalCount = digital!.variants.filter((v) => v.variant_type === 'رقمي').length;
  await expect(field).toHaveCount(digitalCount);
  await expect(field.first()).toHaveValue(STORE_ID);
  await expect(field.first()).toHaveAttribute('dir', 'ltr');
  await expect(field.first()).toHaveAttribute('placeholder', 'com.daralfath.store.book_name');
  await expect(page.getByText('اتركه فارغًا لإخفاء زر الشراء داخل التطبيق').first()).toBeVisible();
  await expect(page.getByText('السعر اللي العميل بيدفعه داخل التطبيق هو سعر المتجر').first()).toBeVisible();
});

test('حفظ كتاب من غير تغيير: كل نسخة بتتحدّث في مكانها بنفس الـ id، والمعرّف والـ sku زي ما هم، ومفيش حذف', async ({ page }) => {
  const calls = await fakeWrites(page);
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const { digital } = await findBooks(page);
  test.skip(!digital, 'مفيش كتاب فيه نسخة رقمية');
  await withStoreId(page, digital!.id, STORE_ID);

  await openVariants(page, digital!.title);
  await save(page);
  await expect.poll(() => variantWrites(calls, 'PATCH').length, { timeout: 20_000 }).toBe(digital!.variants.length);
  await page.waitForTimeout(800);

  // Same ids, updated rather than recreated, and nothing deleted anywhere.
  const patchedIds = variantWrites(calls, 'PATCH').map((c) => /id=eq\.([0-9a-f-]{36})/.exec(c.url)![1]);
  expect(patchedIds.sort()).toEqual(digital!.variants.map((v) => v.id).sort());
  expect(variantWrites(calls, 'POST')).toEqual([]);
  const deletes = calls.filter((c) => c.method === 'DELETE');
  expect(deletes.filter((c) => /product_variants|product_variant_country_prices/.test(c.url))).toEqual([]);
  // The only inventory rows the save clears are by design: a digital copy has no physical stock row,
  // and a book with copies has no stock row of its own (variant_id is null).
  const digitalIds = digital!.variants.filter((v) => v.variant_type === 'رقمي').map((v) => v.id);
  for (const c of deletes.filter((d) => d.url.includes('/product_inventory'))) {
    expect(c.url.includes('variant_id=is.null') || digitalIds.some((id) => c.url.includes(`variant_id=eq.${id}`))).toBe(true);
  }

  // The store id and the sku are carried through untouched.
  for (const patch of variantWrites(calls, 'PATCH')) {
    const id = /id=eq\.([0-9a-f-]{36})/.exec(patch.url)![1];
    const before = digital!.variants.find((v) => v.id === id)!;
    expect(patch.body!.sku).toBe(before.sku || null);
    expect(patch.body!.iap_product_id).toBe(before.variant_type === 'رقمي' && before === digital!.variants.find((v) => v.variant_type === 'رقمي') ? STORE_ID : null);
  }
});

test('معرّف مستخدم في كتاب تاني: رسالة عربي قبل أي كتابة', async ({ page }) => {
  const calls = await fakeWrites(page);
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const { digital } = await findBooks(page);
  test.skip(!digital, 'مفيش كتاب فيه نسخة رقمية');
  await withStoreId(page, digital!.id, STORE_ID);
  // Another copy already has this id.
  await page.route('**/rest/v1/product_variants?*iap_product_id=in.*', (route) =>
    route.fulfill({ json: [{ id: '11111111-1111-4111-8111-111111111111', iap_product_id: STORE_ID }] }));

  await openVariants(page, digital!.title);
  await save(page);
  await expect(page.getByText('هذا المعرّف مستخدم بالفعل في كتاب آخر')).toBeVisible();
  expect(calls).toEqual([]);
});

test('لو قاعدة البيانات رفضت المعرّف المكرر (23505): نفس الرسالة العربي', async ({ page }) => {
  const calls = await fakeWrites(page, {
    failVariantUpdate: { code: '23505', message: 'duplicate key value violates unique constraint "product_variants_iap_product_id_key"', details: 'Key (iap_product_id)=(x) already exists.' },
  });
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const { digital } = await findBooks(page);
  test.skip(!digital, 'مفيش كتاب فيه نسخة رقمية');
  await withStoreId(page, digital!.id, STORE_ID);

  await openVariants(page, digital!.title);
  await save(page);
  await expect(page.getByText('هذا المعرّف مستخدم بالفعل في كتاب آخر')).toBeVisible();
  expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('/rest/v1/product_variants'))).toBe(true);
});

test('معرّف فيه حروف أو مسافات غلط: رسالة تحت الحقل، والحفظ بيتمنع من غير أي كتابة', async ({ page }) => {
  const calls = await fakeWrites(page);
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const { digital } = await findBooks(page);
  test.skip(!digital, 'مفيش كتاب فيه نسخة رقمية');

  await openVariants(page, digital!.title);
  const field = page.getByLabel(LABEL).first();
  await field.fill('معرف عربي غلط');
  await expect(page.getByRole('alert').filter({ hasText: 'حروف إنجليزية' })).toBeVisible();
  await save(page);
  await expect(page.getByText(/نسخة «.*»: المعرّف لازم يكون حروف إنجليزية/)).toBeVisible();
  expect(calls).toEqual([]);

  // Spaces around a good id are trimmed.
  await field.fill(`   ${STORE_ID}  `);
  await field.blur();
  await expect(field).toHaveValue(STORE_ID);
});

test('نسخة ورقية: مفيش حقل المعرّف، وبتتحفظ بـ null، وتحويلها لرقمية بيظهر الحقل', async ({ page }) => {
  const calls = await fakeWrites(page);
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const { physical } = await findBooks(page);
  test.skip(!physical, 'مفيش كتاب كله ورقي');

  await openVariants(page, physical!.title);
  await expect(page.getByLabel(LABEL)).toHaveCount(0);

  // Typing an id on a copy and then making it physical again never stores it.
  await page.locator('select').filter({ has: page.locator('option[value="رقمي"]') }).first().selectOption('رقمي');
  await expect(page.getByLabel(LABEL)).toHaveCount(1);
  await page.getByLabel(LABEL).fill(STORE_ID);
  await page.locator('select').filter({ has: page.locator('option[value="رقمي"]') }).first().selectOption('مادي');
  await expect(page.getByLabel(LABEL)).toHaveCount(0);

  await save(page);
  await expect.poll(() => variantWrites(calls, 'PATCH').length, { timeout: 20_000 }).toBe(physical!.variants.length);
  expect(variantWrites(calls, 'PATCH').every((c) => c.body!.iap_product_id === null)).toBe(true);
});

test('حذف نسخة عليها طلبات: بيسأل الأول، والإلغاء بيسيبها', async ({ page }) => {
  await fakeWrites(page);
  await page.route('**/rest/v1/order_items*', (route) =>
    route.fulfill(ordersCount(3)));
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const { multi } = await findBooks(page);
  test.skip(!multi, 'مفيش كتاب ورقي فيه أكتر من نسخة');

  await openVariants(page, multi!.title);
  const removeButtons = page.getByTitle('حذف النسخة');
  const before = await removeButtons.count();
  await removeButtons.first().click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(/[3٣] طلبات/);
  await expect(dialog).toContainText('هتفقد ارتباطها بالنسخة');

  await dialog.getByRole('button', { name: 'إلغاء' }).click();
  await expect(removeButtons).toHaveCount(before);

  await removeButtons.first().click();
  await dialog.getByRole('button', { name: 'احذف النسخة' }).click();
  await expect(removeButtons).toHaveCount(before - 1);
});

test('حذف نسخة من غير طلبات: بيتشال على طول من غير سؤال', async ({ page }) => {
  await fakeWrites(page);
  await page.route('**/rest/v1/order_items*', (route) =>
    route.fulfill(ordersCount(0)));
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const { multi } = await findBooks(page);
  test.skip(!multi, 'مفيش كتاب ورقي فيه أكتر من نسخة');

  await openVariants(page, multi!.title);
  const removeButtons = page.getByTitle('حذف النسخة');
  const before = await removeButtons.count();
  await removeButtons.first().click();
  await expect(removeButtons).toHaveCount(before - 1);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('حذف نسخة اتباعت منها جوه التطبيق: رسالة واضحة، والمخزون والأسعار ما اتمسحوش', async ({ page }) => {
  const calls = await fakeWrites(page, { failVariantDelete: true });
  await page.route('**/rest/v1/order_items*', (route) =>
    route.fulfill(ordersCount(0)));
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const { multi } = await findBooks(page);
  test.skip(!multi, 'مفيش كتاب ورقي فيه أكتر من نسخة');

  await openVariants(page, multi!.title);
  await page.getByTitle('حذف النسخة').first().click();
  await save(page);
  await expect(page.getByText(/اتباعت منها داخل التطبيق/)).toBeVisible({ timeout: 20_000 });
  // The copy's delete was refused first, so its stock and prices were never touched.
  expect(calls.filter((c) => c.method === 'DELETE' && /product_inventory|product_variant_country_prices/.test(c.url))).toEqual([]);
});
