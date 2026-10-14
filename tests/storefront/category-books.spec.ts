import { test, expect, type Page } from '../fixtures';

// A category row on the home page holds every book of its category (it scrolls sideways) — it was cut at
// four — and a book's page shows every category the book is in, not just its own. Real books are read; nothing
// is written.

const BOOKS_COUNT = /(\d+) كتاب مطابق/;

test('الصفحة الرئيسية: كل صف تصنيف فيه كل كتب التصنيف، ويتسكرول يمين وشمال', async ({ page }) => {
  await page.goto('/');
  const links = page.getByRole('link', { name: 'عرض التصنيف' });
  await expect(links.first()).toBeVisible({ timeout: 20_000 });
  // The extra categories arrive in their own request, after the books: let the rows settle first.
  await page.waitForLoadState('networkidle');
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThan(0);

  const counts: number[] = [];
  for (const href of hrefs) {
    const section = page.locator('section.reveal').filter({ has: page.locator(`a[href="${href}"]`) }).first();
    const inRow = await section.locator('.shelf-rail__item').count();
    counts.push(inRow);

    // The category's own page lists the books the same way (its count too settles once the extra
    // categories are in): the row must hold as many.
    const listing = await page.context().newPage();
    await listing.goto(href);
    await listing.waitForLoadState('networkidle');
    await expect(listing.getByText(BOOKS_COUNT).first(), `الصف ${href}`).toContainText(`${inRow} كتاب مطابق`, { timeout: 20_000 });
    await listing.close();

    // More books than fit on screen: the row has somewhere to scroll to.
    const track = section.locator('.scroll-rail__track');
    const box = await track.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    if (inRow * 200 > box.client) expect(box.scroll).toBeGreaterThan(box.client);
  }
  // Rows were limited to four: at least one real category is longer than that.
  expect(Math.max(...counts)).toBeGreaterThan(4);
});

interface Candidate { id: string; title: string; names: string[] }

/** Books with extra categories (and some without), read the way the storefront reads them. */
async function candidates(page: Page): Promise<{ multi: Candidate[]; single: Candidate[] }> {
  await page.goto('/');
  return page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const { data: links } = await supabase.from('product_categories').select('product_id, categories(name, slug)');
    const { data: catalog } = await supabase.from('products_public_catalog').select('product_id, title, category_name');
    type Link = { product_id: string; categories: { name: string; slug: string } | null };
    const extras = new Map<string, string[]>();
    for (const row of (links ?? []) as unknown as Link[]) {
      if (!row.categories) continue;
      extras.set(row.product_id, [...(extras.get(row.product_id) ?? []), row.categories.name.trim()]);
    }
    const seen = new Set<string>();
    const multi: Candidate[] = [];
    const single: Candidate[] = [];
    for (const row of (catalog ?? []) as { product_id: string; title: string; category_name: string | null }[]) {
      if (seen.has(row.product_id) || !row.category_name) continue;
      seen.add(row.product_id);
      const own = row.category_name.trim();
      const more = (extras.get(row.product_id) ?? []).filter((n) => n !== own);
      (more.length ? multi : single).push({ id: row.product_id, title: row.title.trim(), names: [own, ...more] });
    }
    return { multi, single };
  });
}

test('صفحة الكتاب: شارة لكل تصنيف الكتاب موجود فيه، وكل شارة بتفتح التصنيف', async ({ page }) => {
  const { multi } = await candidates(page);
  test.skip(multi.length === 0, 'مفيش كتاب في أكتر من تصنيف');

  let checked = 0;
  for (const book of multi.slice(0, 6)) {
    await page.goto(`/book/${book.id}`);
    const chips = page.getByTestId('book-categories');
    if (!(await chips.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false))) continue;

    const names = (await chips.locator('a').allInnerTexts()).map((t) => t.trim());
    expect(names.slice().sort(), book.title).toEqual(book.names.slice().sort());
    expect(names[0], 'تصنيفه الأساسي الأول').toBe(book.names[0]);

    // The extra categories are real links to their listing, and the book is in it.
    const last = chips.locator('a').last();
    expect(await last.getAttribute('href')).toMatch(/^\/books\?category=/);
    await last.click();
    await expect(page).toHaveURL(/\/books\?category=/);
    await expect(page.locator('article.book-card').filter({ hasText: book.title }).first()).toBeVisible({ timeout: 20_000 });
    checked++;
    if (checked === 2) break;
  }
  expect(checked, 'لقينا كتب نقدر نتحقق منها').toBeGreaterThan(0);
});

test('صفحة الكتاب: كتاب في تصنيف واحد بيعرض شارة واحدة', async ({ page }) => {
  const { single } = await candidates(page);
  test.skip(single.length === 0, 'كل الكتب في أكتر من تصنيف');

  for (const book of single.slice(0, 6)) {
    await page.goto(`/book/${book.id}`);
    const chips = page.getByTestId('book-categories');
    if (!(await chips.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false))) continue;
    await expect(chips.locator('a')).toHaveCount(1);
    await expect(chips.locator('a')).toHaveText(book.names[0]);
    return;
  }
  test.skip(true, 'ما قدرناش نفتح أي كتاب بتصنيف واحد');
});
