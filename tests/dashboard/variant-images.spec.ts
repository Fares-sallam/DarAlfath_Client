import { test, expect, type Page, type Route } from '../fixtures';

// The book form's picture gallery: with several editions, each picture can be tied to one of them (or to
// "كل النسخ"). A real book is opened; its gallery is answered in flight and every write is answered in
// flight too (and recorded), so nothing reaches the database.

type Row = Record<string, unknown>;
type Product = { id: string; title: string; is_bundle?: boolean; product_variants?: { id: string; variant_name: string }[] };

async function openBookWith(page: Page, editionCount: 'several' | 'one') {
  const writes: { method: string; url: string; body: Row | null }[] = [];
  let books: Product[] = [];
  const created = new Date().toISOString();

  // The book list: read for real, remembered so a book with the right number of editions can be picked.
  await page.route(/\/rest\/v1\/products\?/, async (route: Route) => {
    try {
      const response = await route.fetch();
      const json = (await response.json()) as unknown;
      if (Array.isArray(json)) books = json as Product[];
      await route.fulfill({ response, json });
    } catch {
      // The test ended while this was still on its way: just let it go.
      await route.continue().catch(() => undefined);
    }
  });
  await page.route('**/rest/v1/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'GET' || request.method() === 'HEAD') return route.fallback();
    writes.push({ method: request.method(), url: request.url(), body: request.postData() ? JSON.parse(request.postData()!) : null });
    return route.fulfill({ status: 204 });
  });

  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => books.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const unique = (p: Product) => books.filter((b) => b.title === p.title).length === 1;
  const pick = books.find((p) => !p.is_bundle && unique(p) && (editionCount === 'several' ? (p.product_variants?.length ?? 0) >= 2 : (p.product_variants?.length ?? 0) === 1));
  test.skip(!pick, 'مفيش كتاب بالعدد المطلوب من النسخ');
  const editions = pick!.product_variants!;

  // Two pictures in the gallery: the book's own, and one tied to the last edition.
  await page.route('**/rest/v1/product_images*', async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'GET' || !request.url().includes(`product_id=eq.${pick!.id}`)) return route.fallback();
    return route.fulfill({
      json: [
        { id: 'img-1', product_id: pick!.id, url: 'https://img.test/one.jpg', alt_text: null, sort_order: 0, is_primary: false, variant_id: null, created_at: created },
        { id: 'img-2', product_id: pick!.id, url: 'https://img.test/two.jpg', alt_text: null, sort_order: 1, is_primary: false, variant_id: editions[editions.length - 1].id, created_at: created },
      ],
    });
  });
  await page.route('https://img.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));

  await page.locator('tbody tr').filter({ hasText: pick!.title }).first().getByTitle('تعديل').click();
  await page.getByRole('tab', { name: /الصور والملفات/ }).or(page.getByRole('button', { name: /الصور والملفات/ })).first().click();
  await expect(page.getByText('2 صورة مضافة')).toBeVisible({ timeout: 15_000 });
  return { writes, editions };
}

test('كتاب بأكتر من نسخة: تحت كل صورة قايمة بالنسخة اللي بتظهر معاها، وتغييرها بيتحفظ', async ({ page }) => {
  const { writes, editions } = await openBookWith(page, 'several');
  const selects = page.getByTestId('image-edition');
  await expect(selects).toHaveCount(2);
  await expect(page.getByText(/لكل صورة اختار النسخة اللي بتظهر معاها/)).toBeVisible();

  // "كل النسخ", then one entry per edition.
  const options = await selects.first().locator('option').allInnerTexts();
  expect(options[0]).toBe('كل النسخ');
  expect(options).toHaveLength(1 + editions.length);
  // What the gallery has: the first picture is the book's own, the second belongs to the last edition.
  await expect(selects.nth(0)).toHaveValue('');
  await expect(selects.nth(1)).toHaveValue(editions[editions.length - 1].id);

  // Tie the first picture to the first edition…
  await selects.nth(0).selectOption(editions[0].id);
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('PATCH');
  expect(decodeURIComponent(writes[0].url)).toContain('product_images?id=eq.img-1');
  expect(writes[0].body).toEqual({ variant_id: editions[0].id });

  // …and let the second go back to every edition.
  await selects.nth(1).selectOption('');
  await expect.poll(() => writes.length).toBe(2);
  expect(decodeURIComponent(writes[1].url)).toContain('product_images?id=eq.img-2');
  expect(writes[1].body).toEqual({ variant_id: null });
});

test('كتاب بنسخة واحدة: مفيش قوايم نسخ تحت الصور', async ({ page }) => {
  await openBookWith(page, 'one');
  await expect(page.getByTestId('image-edition')).toHaveCount(0);
  await expect(page.getByText(/لكل صورة اختار النسخة اللي بتظهر معاها/)).toHaveCount(0);
});
