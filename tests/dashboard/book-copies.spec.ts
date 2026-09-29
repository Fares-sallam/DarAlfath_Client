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

type Write = { method: string; path: string; body: string | null };

const idsIn = (path: string) => (path.match(/id=in\.\(([^)]*)\)/)?.[1] ?? '').split(',').sort();

/** Records every write the page sends, and answers each with an empty success (nothing reaches the database). */
async function fakeWrites(page: Page): Promise<Write[]> {
  const writes: Write[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.method() !== 'HEAD' && r.url().includes('/rest/v1/')) {
      writes.push({ method: r.method(), path: decodeURIComponent(r.url().split('/rest/v1/')[1]), body: r.postData() });
    }
  });
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    return method === 'GET' || method === 'HEAD' ? route.fallback() : route.fulfill({ status: 204 });
  });
  return writes;
}

interface BundleCopy { variantId: string; items: { component_variant_id: string; quantity: number }[]; holdsBook: boolean }
interface FoundBook {
  id: string;
  title: string;
  bundles: { id: string; title: string; hidden: boolean; copies: BundleCopy[] }[];
}

/** A visible book that sits inside bundles still on sale, and what each of those bundles holds — straight from the database. */
async function findBookInBundles(page: Page): Promise<FoundBook | null> {
  return page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const { data: held } = await supabase
      .from('bundle_items')
      .select('component_product_id, bundle:products!bundle_items_bundle_product_id_fkey(id, is_active)');
    const onSale = new Map<string, Set<string>>();
    for (const i of (held ?? []) as unknown as { component_product_id: string; bundle: { id: string; is_active: boolean } | null }[]) {
      if (!i.bundle?.is_active) continue;
      const set = onSale.get(i.component_product_id) ?? new Set<string>();
      set.add(i.bundle.id);
      onSale.set(i.component_product_id, set);
    }
    const { data: books } = await supabase.from('products').select('id, title').eq('is_active', true).eq('is_bundle', false).in('id', [...onSale.keys()]);
    const describe = async (b: { id: string; title: string }) => {
      const bundleIds = [...onSale.get(b.id)!];
      const { data: rows } = await supabase
        .from('bundle_items')
        .select('bundle_product_id, bundle_variant_id, component_variant_id, component_product_id, quantity, sort_order, bundle:products!bundle_items_bundle_product_id_fkey(title)')
        .in('bundle_product_id', bundleIds)
        .order('sort_order');
      type Row = { bundle_product_id: string; bundle_variant_id: string; component_variant_id: string; component_product_id: string; quantity: number; bundle: { title: string } };
      const byBundle = new Map<string, { title: string; copies: Map<string, Row[]> }>();
      for (const r of (rows ?? []) as unknown as Row[]) {
        const bundle = byBundle.get(r.bundle_product_id) ?? { title: r.bundle.title, copies: new Map<string, Row[]>() };
        bundle.copies.set(r.bundle_variant_id, [...(bundle.copies.get(r.bundle_variant_id) ?? []), r]);
        byBundle.set(r.bundle_product_id, bundle);
      }
      const bundles = bundleIds.map((id) => {
        const bundle = byBundle.get(id)!;
        const copies = [...bundle.copies].map(([variantId, list]) => ({
          variantId,
          items: list.map((r) => ({ component_variant_id: r.component_variant_id, quantity: r.quantity })),
          holdsBook: list.some((r) => r.component_product_id === b.id),
          // Distinct books the copy keeps once this book is out.
          keeps: new Set(list.filter((r) => r.component_product_id !== b.id).map((r) => r.component_variant_id)).size,
        }));
        // A bundle is hidden (not trimmed) when a copy holding the book would keep fewer than two books.
        const hidden = Math.min(...copies.filter((c) => c.holdsBook).map((c) => c.keeps)) < 2;
        return { id, title: bundle.title, hidden, copies: copies.map(({ keeps: _keeps, ...c }) => c) };
      });
      return { id: b.id as string, title: (b.title as string).trim(), bundles };
    };
    // Prefer a book that a bundle can lose without falling short, so the rewrite path is exercised too.
    let found: Awaited<ReturnType<typeof describe>> | null = null;
    for (const candidate of books ?? []) {
      const described = await describe(candidate);
      found ??= described;
      if (described.bundles.some((x) => !x.hidden)) return described;
    }
    return found;
  });
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('إخفاء كتاب جوه مجموعة بيسأل: من المجموعة وككتاب فردي، ولا ككتاب فردي بس', async ({ page }) => {
  const writes = await fakeWrites(page);
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

  const book = await findBookInBundles(page);
  test.skip(!book, 'مفيش كتاب ظاهر جوه مجموعة معروضة للبيع');

  const row = page.locator('tbody tr').filter({ has: page.locator('span.truncate', { hasText: new RegExp(`^${escapeRegExp(book!.title)}$`) }) }).first();
  const dialog = page.getByRole('alertdialog');
  const fromBundles = dialog.getByRole('button', { name: /يتخفي من المجموع(ة|ات) وككتاب فردي/ });
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

  // From the bundles too: first the removal is written down (so it can be undone), then every bundle
  // copy that holds the book is rewritten without it, then one write hides the book (plus any bundle
  // that would be left with fewer than two books).
  writes.length = 0;
  await row.getByTitle('إخفاء').click();
  await fromBundles.click();
  const rewrites = book!.bundles.filter((b) => !b.hidden).reduce((n, b) => n + b.copies.filter((c) => c.holdsBook).length, 0);
  await expect.poll(() => writes.length).toBe(rewrites + 2);

  const [note, ...rest] = writes;
  expect(note.method).toBe('POST');
  expect(note.path.startsWith('audit_logs')).toBe(true);
  const logged = JSON.parse(note.body!);
  expect(logged).toMatchObject({ action: 'UPDATE', table_name: 'bundle_items', record_id: book!.id });
  expect(logged.new_data).toMatchObject({ event: 'book_removed_from_bundles', book_title: book!.title });
  expect(logged.new_data.bundles.map((b: { bundle_id: string }) => b.bundle_id).sort()).toEqual(book!.bundles.map((b) => b.id).sort());

  const rpcs = rest.slice(0, rewrites);
  expect(rpcs.every((w) => w.method === 'POST' && w.path.startsWith('rpc/set_bundle_items'))).toBe(true);
  for (const w of rpcs) expect(JSON.parse(w.body!).p_items.length).toBeGreaterThanOrEqual(2);
  const hide = rest[rewrites];
  expect(hide.path.startsWith('products?')).toBe(true);
  expect(idsIn(hide.path)).toEqual([book!.id, ...book!.bundles.filter((b) => b.hidden).map((b) => b.id)].sort());
});

test('تفعيل كتاب اتشال من المجموعات: بيرجع لنفس مكانه وبكميته، والمجموعات الناقصة ترجع للبيع', async ({ page }) => {
  const writes = await fakeWrites(page);
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

  const book = await findBookInBundles(page);
  test.skip(!book, 'مفيش كتاب ظاهر جوه مجموعة معروضة للبيع');

  // 1) Hide it from the bundles too, and keep what got written down about the removal.
  const rowFor = () => page.locator('tbody tr').filter({ has: page.locator('span.truncate', { hasText: new RegExp(`^${escapeRegExp(book!.title)}$`) }) }).first();
  await rowFor().getByTitle('إخفاء').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /يتخفي من المجموع(ة|ات) وككتاب فردي/ }).click();
  const trimmed = book!.bundles.filter((b) => !b.hidden);
  const rewrites = trimmed.reduce((n, b) => n + b.copies.filter((c) => c.holdsBook).length, 0);
  await expect.poll(() => writes.length).toBe(rewrites + 2);
  const removal = JSON.parse(writes[0].body!).new_data;
  writes.length = 0;

  // 2) The state afterwards, as the database would have it: the book is hidden, the log holds the removal,
  //    the trimmed copies no longer list the book, and the short bundles are off sale.
  const offSale = book!.bundles.filter((b) => b.hidden).map((b) => b.id);
  const trimmedCopies = new Set(trimmed.flatMap((b) => b.copies.filter((c) => c.holdsBook).map((c) => c.variantId)));
  await page.route('**/rest/v1/audit_logs?*', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: [{ new_data: removal, created_at: new Date().toISOString() }] }) : route.fallback());
  await page.route('**/rest/v1/bundle_items?*', async (route) => {
    if (route.request().method() !== 'GET' || !route.request().url().includes('bundle_product_id=in.')) return route.fallback();
    const response = await route.fetch();
    const rows = (await response.json()) as { bundle_variant_id: string; component_product_id: string }[];
    return route.fulfill({ response, json: rows.filter((r) => !(trimmedCopies.has(r.bundle_variant_id) && r.component_product_id === book!.id)) });
  });
  await page.route('**/rest/v1/products?*', async (route) => {
    const url = decodeURIComponent(route.request().url());
    if (route.request().method() !== 'GET') return route.fallback();
    if (url.includes('select=id&') && url.includes('is_active=eq.false')) return route.fulfill({ json: offSale.map((id) => ({ id })) });
    const response = await route.fetch();
    const json = await response.json();
    return route.fulfill({
      response,
      json: Array.isArray(json) ? json.map((p: { id?: string }) => (p.id === book!.id ? { ...p, is_active: false } : p)) : json,
    });
  });
  await page.reload();
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

  // 3) Show it again.
  await rowFor().getByTitle('تفعيل').click();
  await expect.poll(() => writes.length).toBe(1 + rewrites + (offSale.length > 0 ? 1 : 0) + 1);

  const [show, ...after] = writes;
  expect(show.method).toBe('PATCH');
  expect(idsIn(show.path.replace('id=eq.', 'id=in.(') + ')')).toEqual([book!.id]);
  expect(JSON.parse(show.body!)).toEqual({ is_active: true });

  // Each trimmed copy is rewritten with exactly the books it had before, in the same order and quantities.
  const rpcs = after.slice(0, rewrites);
  const expectedByCopy = new Map(trimmed.flatMap((b) => b.copies.filter((c) => c.holdsBook).map((c) => [c.variantId, c.items] as const)));
  expect(rpcs.map((w) => JSON.parse(w.body!).p_bundle_variant_id).sort()).toEqual([...expectedByCopy.keys()].sort());
  for (const w of rpcs) {
    const body = JSON.parse(w.body!);
    expect(w.path.startsWith('rpc/set_bundle_items')).toBe(true);
    expect(body.p_items).toEqual(expectedByCopy.get(body.p_bundle_variant_id)!.map((item, idx) => ({ ...item, sort_order: idx })));
  }

  let next = rewrites;
  if (offSale.length > 0) {
    expect(after[next].path.startsWith('products?')).toBe(true);
    expect(idsIn(after[next].path)).toEqual([...offSale].sort());
    expect(JSON.parse(after[next].body!)).toEqual({ is_active: true });
    next += 1;
  }

  // The undo is written down too, so it isn't applied a second time.
  expect(after[next].path.startsWith('audit_logs')).toBe(true);
  expect(JSON.parse(after[next].body!).new_data).toMatchObject({ event: 'book_restored_to_bundles' });

  // The refetch after the change may still be in flight; don't let it outlive the test.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
