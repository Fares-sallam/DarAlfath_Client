import { test, expect, type Page } from '@playwright/test';

// These open the book form and exercise it without saving. As a safety net
// against the live database, every write request is blocked: only reads go out.
test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    return method === 'GET' || method === 'HEAD' ? route.continue() : route.abort();
  });
});

const nameSelect = (page: Page) => page.locator('select:has(option[value="__custom__"])');

test('قائمة أسماء النسخ فيها «مقاس 24*17» و«مخصص» اللي بيفتح مربع للاسم', async ({ page }) => {
  await page.goto('/books');
  await page.getByRole('button', { name: 'إضافة كتاب جديد' }).click();
  await page.getByRole('button', { name: /أنواع النسخ/ }).click();
  await page.getByRole('button', { name: 'إضافة نسخة' }).click();

  const select = nameSelect(page).first();
  const options = await select.locator('option').allInnerTexts();
  expect(options).toEqual(expect.arrayContaining(['ورق عادي', 'مقاس 24*17', 'A4', 'كوشيه', 'إلكتروني', 'مخصص']));
  expect(options).not.toContain('ورق فاخر');

  await select.selectOption('__custom__');
  const custom = page.getByPlaceholder('اكتب اسم النوع');
  await expect(custom).toBeVisible();
  await custom.fill('غلاف مقوى');
  await expect(select).toHaveValue('__custom__');

  await select.selectOption('كوشيه');
  await expect(custom).toHaveCount(0);
  await page.getByRole('button', { name: 'إلغاء' }).click();
});

test('نسخ المجموعة: إضافة نسخة، ومنع اسمين متكررين، وحذف النسخة', async ({ page }) => {
  await page.goto('/books');
  const bundleRow = page.locator('tbody tr').filter({ has: page.locator('span.bg-amber-100', { hasText: 'مجموعة' }) }).first();
  await expect(bundleRow).toBeVisible({ timeout: 15_000 });
  await bundleRow.getByTitle('تعديل').click();
  await page.getByRole('button', { name: /نسخ المجموعة/ }).click();

  const chips = page.getByRole('tab');
  const before = await chips.count(); // 0 when the bundle has a single copy
  const firstName = await (async () => {
    const value = await nameSelect(page).inputValue();
    return value === '__custom__' ? page.getByPlaceholder('اكتب اسم النوع').inputValue() : value;
  })();

  await page.getByRole('button', { name: 'إضافة نسخة' }).click();
  await expect(chips).toHaveCount(Math.max(before, 1) + 1);
  await expect(chips.last()).toHaveAttribute('aria-selected', 'true');
  const presets = await nameSelect(page).locator('option').allInnerTexts();
  expect(presets).not.toContain('إلكتروني'); // bundles are paper only

  // Give the new copy the first copy's name: saving must refuse before any request.
  if (presets.includes(firstName)) {
    await nameSelect(page).selectOption(firstName);
  } else {
    await nameSelect(page).selectOption('__custom__');
    await page.getByPlaceholder('اكتب اسم النوع').fill(firstName);
  }
  await page.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByText(/فيه نسخة تانية بنفس الاسم/)).toBeVisible();

  await page.getByRole('button', { name: /حذف النسخة/ }).click();
  await expect(chips).toHaveCount(before);
  await page.getByRole('button', { name: 'إلغاء' }).click();
});

test('إخفاء كتاب جوه مجموعة بيسأل: من المجموعة وككتاب فردي، ولا ككتاب فردي بس', async ({ page }) => {
  const writes: { method: string; path: string; body: string | null }[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.method() !== 'HEAD' && r.url().includes('/rest/v1/')) {
      writes.push({ method: r.method(), path: decodeURIComponent(r.url().split('/rest/v1/')[1]), body: r.postData() });
    }
  });
  const idsIn = (path: string) => (path.match(/id=in\.\(([^)]*)\)/)?.[1] ?? '').split(',').sort();

  // Writes are answered with an empty success (never sent to the database), so the
  // flow can run to its end: several bundle rewrites and then the hide itself.
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    return method === 'GET' || method === 'HEAD' ? route.fallback() : route.fulfill({ status: 204 });
  });

  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

  // A visible book that sits inside bundles still on sale, and what each of those bundles holds — straight from the database.
  const book = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const { data: items } = await supabase
      .from('bundle_items')
      .select('component_product_id, bundle:products!bundle_items_bundle_product_id_fkey(id, title, is_active)');
    const onSale = new Map<string, Set<string>>();
    for (const i of (items ?? []) as unknown as { component_product_id: string; bundle: { id: string; title: string; is_active: boolean } | null }[]) {
      if (!i.bundle?.is_active) continue;
      const set = onSale.get(i.component_product_id) ?? new Set<string>();
      set.add(i.bundle.id);
      onSale.set(i.component_product_id, set);
    }
    const { data: books } = await supabase.from('products').select('id, title').eq('is_active', true).eq('is_bundle', false).in('id', [...onSale.keys()]);
    const b = (books ?? [])[0];
    if (!b) return null;
    const bundleIds = [...onSale.get(b.id)!];
    const { data: rows } = await supabase
      .from('bundle_items')
      .select('bundle_product_id, bundle_variant_id, component_product_id, bundle:products!bundle_items_bundle_product_id_fkey(title)')
      .in('bundle_product_id', bundleIds);
    const titles = new Map<string, string>();
    const copies = new Map<string, Map<string, Set<string>>>();
    for (const r of (rows ?? []) as unknown as { bundle_product_id: string; bundle_variant_id: string; component_product_id: string; bundle: { title: string } }[]) {
      titles.set(r.bundle_product_id, r.bundle.title);
      const byCopy = copies.get(r.bundle_product_id) ?? new Map<string, Set<string>>();
      const books2 = byCopy.get(r.bundle_variant_id) ?? new Set<string>();
      books2.add(r.component_product_id);
      byCopy.set(r.bundle_variant_id, books2);
      copies.set(r.bundle_product_id, byCopy);
    }
    // A bundle is hidden (not trimmed) when a copy holding the book would keep fewer than two books.
    const bundles = bundleIds.map((id) => {
      const holding = [...copies.get(id)!.values()].filter((set) => set.has(b.id));
      return { id, title: titles.get(id)!, hidden: Math.min(...holding.map((set) => set.size - 1)) < 2, copiesToRewrite: holding.length };
    });
    return { id: b.id as string, title: (b.title as string).trim(), bundles };
  });
  test.skip(!book, 'مفيش كتاب ظاهر جوه مجموعة معروضة للبيع');

  const exact = new RegExp(`^${book!.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const row = page.locator('tbody tr').filter({ has: page.locator('span.truncate', { hasText: exact }) }).first();
  const dialog = page.getByRole('alertdialog');
  const fromBundles = dialog.getByRole('button', { name: /يتخفي من المجموعات? وككتاب فردي/ });
  const bookOnly = dialog.getByRole('button', { name: /يتخفي ككتاب فردي لوحده ويفضل في/ });

  // The question names the book and every bundle, and offers both ways plus cancel.
  await row.getByTitle('إخفاء').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(book!.title);
  for (const bundle of book!.bundles) await expect(dialog).toContainText(bundle.title);
  await expect(fromBundles).toBeVisible();
  await expect(bookOnly).toBeVisible();

  // Cancel: nothing is sent.
  await dialog.getByRole('button', { name: 'إلغاء' }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(500);
  expect(writes).toEqual([]);

  // As a product of its own only: one write, for that book alone; the bundles are not touched.
  await row.getByTitle('إخفاء').click();
  await bookOnly.click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('PATCH');
  expect(idsIn(writes[0].path)).toEqual([book!.id]);
  await expect(dialog).toBeHidden();

  // From the bundles too: every bundle copy that holds the book is rewritten without it,
  // then one write hides the book (plus any bundle that would be left with fewer than two books).
  writes.length = 0;
  await row.getByTitle('إخفاء').click();
  await fromBundles.click();
  const rewrites = book!.bundles.filter((b) => !b.hidden).reduce((n, b) => n + b.copiesToRewrite, 0);
  await expect.poll(() => writes.length).toBe(rewrites + 1);
  const rpcs = writes.slice(0, rewrites);
  expect(rpcs.every((w) => w.method === 'POST' && w.path.startsWith('rpc/set_bundle_items'))).toBe(true);
  for (const w of rpcs) expect(JSON.parse(w.body!).p_items.length).toBeGreaterThanOrEqual(2);
  const hide = writes[rewrites];
  expect(hide.path.startsWith('products?')).toBe(true);
  expect(idsIn(hide.path)).toEqual([book!.id, ...book!.bundles.filter((b) => b.hidden).map((b) => b.id)].sort());
});
