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

test('إخفاء كتاب جوه مجموعة بيسأل: الكتاب بس ولا الكتاب والمجموعات معاه', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.method() !== 'HEAD' && r.url().includes('/rest/v1/')) writes.push(`${r.method()} ${decodeURIComponent(r.url().split('/rest/v1/')[1])}`);
  });
  const idsIn = (write: string) => (write.match(/id=in\.\(([^)]*)\)/)?.[1] ?? '').split(',').sort();

  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

  // A visible book that sits inside bundles still on sale, read straight from the database.
  const book = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const { data: items } = await supabase
      .from('bundle_items')
      .select('component_product_id, bundle:products!bundle_items_bundle_product_id_fkey(id, title, is_active)');
    const bundlesByBook = new Map<string, Map<string, string>>();
    for (const i of (items ?? []) as unknown as { component_product_id: string; bundle: { id: string; title: string; is_active: boolean } | null }[]) {
      if (!i.bundle?.is_active) continue;
      const m = bundlesByBook.get(i.component_product_id) ?? new Map<string, string>();
      m.set(i.bundle.id, i.bundle.title);
      bundlesByBook.set(i.component_product_id, m);
    }
    const { data: books } = await supabase.from('products').select('id, title').eq('is_active', true).eq('is_bundle', false).in('id', [...bundlesByBook.keys()]);
    const b = (books ?? [])[0];
    return b ? { id: b.id as string, title: (b.title as string).trim(), bundles: [...bundlesByBook.get(b.id)!].map(([id, title]) => ({ id, title })) } : null;
  });
  test.skip(!book, 'مفيش كتاب ظاهر جوه مجموعة معروضة للبيع');

  const exact = new RegExp(`^${book!.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const row = page.locator('tbody tr').filter({ has: page.locator('span.truncate', { hasText: exact }) }).first();
  const dialog = page.getByRole('alertdialog');

  // The question names the book and every bundle, and offers all three ways out.
  await row.getByTitle('إخفاء').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(book!.title);
  for (const bundle of book!.bundles) await expect(dialog).toContainText(bundle.title);
  await expect(dialog.getByRole('button', { name: /إخفاء الكتاب بس/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /إخفاء الكتاب و(المجموعات كلها|المجموعة كاملة)/ })).toBeVisible();

  // Cancel: nothing is sent.
  await dialog.getByRole('button', { name: 'إلغاء' }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(500);
  expect(writes).toEqual([]);

  // Just the book: one write, for that book alone.
  await row.getByTitle('إخفاء').click();
  await dialog.getByRole('button', { name: /إخفاء الكتاب بس/ }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(idsIn(writes[0])).toEqual([book!.id]);
  await expect(dialog).toBeHidden();

  // The book and its bundles: one write covering the book and every bundle (all-or-nothing).
  await row.getByTitle('إخفاء').click();
  await dialog.getByRole('button', { name: /إخفاء الكتاب و(المجموعات كلها|المجموعة كاملة)/ }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(idsIn(writes[1])).toEqual([book!.id, ...book!.bundles.map((b) => b.id)].sort());
  expect(writes.every((w) => w.startsWith('PATCH products?'))).toBe(true);
});
