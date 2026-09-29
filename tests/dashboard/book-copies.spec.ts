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

test('إخفاء كتاب جوه مجموعة بيحذّر الأول، ولو رفضت مفيش حاجة بتتغير', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.method() !== 'HEAD' && r.url().includes('/rest/v1/')) writes.push(`${r.method()} ${new URL(r.url()).pathname.split('/').pop()}`);
  });

  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

  // A visible book that sits inside a bundle still on sale, read straight from the database.
  const book = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const { data: items } = await supabase
      .from('bundle_items')
      .select('component_product_id, bundle:products!bundle_items_bundle_product_id_fkey(title, is_active)');
    const bundlesByBook = new Map<string, Set<string>>();
    for (const i of (items ?? []) as unknown as { component_product_id: string; bundle: { title: string; is_active: boolean } | null }[]) {
      if (!i.bundle?.is_active) continue;
      (bundlesByBook.get(i.component_product_id) ?? bundlesByBook.set(i.component_product_id, new Set()).get(i.component_product_id)!).add(i.bundle.title);
    }
    const { data: books } = await supabase.from('products').select('id, title').eq('is_active', true).eq('is_bundle', false).in('id', [...bundlesByBook.keys()]);
    const b = (books ?? [])[0];
    return b ? { title: b.title as string, bundles: [...bundlesByBook.get(b.id)!] } : null;
  });
  test.skip(!book, 'مفيش كتاب ظاهر جوه مجموعة معروضة للبيع');

  const exact = new RegExp(`^${book!.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const row = page.locator('tbody tr').filter({ has: page.locator('span.truncate', { hasText: exact }) }).first();

  // Refuse: the warning names the book and every bundle, and nothing is sent.
  let message = '';
  page.once('dialog', (d) => { message = d.message(); void d.dismiss(); });
  await row.getByTitle('إخفاء').click();
  await expect.poll(() => message).not.toBe('');
  expect(message).toContain(`«${book!.title}»`);
  for (const bundle of book!.bundles) expect(message).toContain(bundle);
  expect(message).toContain('هتفضل تتباع');
  await page.waitForTimeout(500);
  expect(writes).toEqual([]);

  // Accept: the hide request goes out (blocked by the route above, so the book stays visible).
  page.once('dialog', (d) => void d.accept());
  await row.getByTitle('إخفاء').click();
  await expect.poll(() => writes).toContain('PATCH products');
});
