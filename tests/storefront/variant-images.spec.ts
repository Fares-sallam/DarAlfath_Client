import { test, expect, type Locator, type Page, type Route } from '../fixtures';

// A book sold in several editions can have pictures of its own for each: choosing an edition shows its
// pictures; an edition with none (or none chosen yet) shows what the book has, the cover first. A real book
// in several editions is used; its gallery rows are answered in flight (nothing is written anywhere).

type Row = Record<string, unknown>;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const IMG = (name: string) => `https://img.test/${name}.jpg`;

/** Opens a real book that has two editions in stock, with the gallery `rowsFor` makes from its editions. */
async function openBook(page: Page, rowsFor: (editions: { id: string; name: string }[]) => Row[]) {
  let book: { id: string; cover: string } | undefined;
  await page.route('**/rest/v1/products_public_catalog*', async (route: Route) => {
    const response = await route.fetch();
    const json = (await response.json()) as Row[];
    const pick = json.find((r) => Number(r.variant_count) > 1 && !r.is_bundle && r.cover_url);
    if (!book && pick) book = { id: String(pick.product_id), cover: String(pick.cover_url) };
    return route.fulfill({ response, json });
  });
  await page.goto('/books');
  await expect(page.locator('article.book-card').first()).toBeVisible({ timeout: 20_000 });
  test.skip(!book, 'مفيش كتاب بأكتر من طبعة وليه غلاف');
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  await page.route('https://img.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } }));
  let editions: { id: string; name: string }[] = [];
  await page.route('**/rest/v1/product_variants_public*', async (route: Route) => {
    const response = await route.fetch();
    const json = (await response.json()) as Row[];
    const mine = json.filter((v) => v.product_id === book!.id);
    if (mine.length) editions = mine.map((v) => ({ id: String(v.variant_id), name: String(v.variant_name) }));
    return route.fulfill({ response, json });
  });
  await page.route('**/rest/v1/product_images*', async (route: Route) => {
    if (route.request().method() !== 'GET' || !route.request().url().includes(book!.id)) return route.fallback();
    for (let i = 0; i < 100 && editions.length < 2; i++) await new Promise((r) => setTimeout(r, 50)); // the editions come first
    return route.fulfill({ json: rowsFor(editions) });
  });

  await page.goto(`/book/${book!.id}`);
  const buttons = page.locator('.bk3-var');
  await expect(buttons.first()).toBeVisible({ timeout: 20_000 });
  // Two editions that can be chosen (an edition out of stock can't).
  const enabled = await buttons.evaluateAll((els) => els.map((el, i) => (el as HTMLButtonElement).disabled ? -1 : i).filter((i) => i >= 0));
  test.skip(enabled.length < 2, 'الكتاب مالوش طبعتين متاحتين');
  const choose = (n: 0 | 1) => buttons.nth(enabled[n]).click();
  return { cover: book!.cover, editions: () => editions, enabled, choose };
}

const thumbs = (page: Page) => page.locator('.bk3-thumb img').evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src')));
const main = (page: Page): Locator => page.locator('.bk3-book__cover img');

test('الطبعة اللي ليها صور خاصة بيها: الصور بتتبدّل مع الاختيار في الاتجاهين، والنسخة اللي من غير صور بتعرض صور الكتاب كلها والغلاف الأول', async ({ page }) => {
  // Pictures for the first edition (and one for the book itself), none for the others.
  const book = await openBook(page, (editions) => [
    { url: IMG('general'), variant_id: null },
    { url: IMG('own-1'), variant_id: editions[0]?.id },
    { url: IMG('own-2'), variant_id: editions[0]?.id },
  ]);
  // The buttons follow the editions' order, so the first edition is the first button.
  test.skip(book.enabled[0] !== 0, 'الطبعة الأولى مش متاحة');
  const everything = [book.cover, IMG('general'), IMG('own-1'), IMG('own-2')];

  // No edition chosen yet: what the book has, the cover first.
  expect(await thumbs(page)).toEqual(everything);
  await expect(main(page)).toHaveAttribute('src', book.cover);

  // The edition with pictures of its own: those and only those, the main picture being its first.
  await book.choose(0);
  await expect.poll(() => thumbs(page)).toEqual([IMG('own-1'), IMG('own-2')]);
  await expect(main(page)).toHaveAttribute('src', IMG('own-1'));

  // An edition with none: the book's pictures again, cover first.
  await book.choose(1);
  await expect.poll(() => thumbs(page)).toEqual(everything);
  await expect(main(page)).toHaveAttribute('src', book.cover);

  // And back to the first.
  await book.choose(0);
  await expect.poll(() => thumbs(page)).toEqual([IMG('own-1'), IMG('own-2')]);
  await expect(main(page)).toHaveAttribute('src', IMG('own-1'));
});

test('كتاب صوره كلها للكتاب (مش مربوطة بطبعة): تغيير الطبعة ما بيرجّعش الصورة المختارة للأولى', async ({ page }) => {
  const book = await openBook(page, () => [
    { url: IMG('shared-1'), variant_id: null },
    { url: IMG('shared-2'), variant_id: null },
  ]);
  const all = [book.cover, IMG('shared-1'), IMG('shared-2')];
  await book.choose(0);
  await expect.poll(() => thumbs(page)).toEqual(all);

  // The viewer picks the third picture…
  await page.locator('.bk3-thumb').nth(2).click();
  await expect(main(page)).toHaveAttribute('src', IMG('shared-2'));
  // …and choosing the other edition (same pictures) leaves it there.
  await book.choose(1);
  await expect.poll(() => thumbs(page)).toEqual(all);
  await expect(main(page)).toHaveAttribute('src', IMG('shared-2'));
});
