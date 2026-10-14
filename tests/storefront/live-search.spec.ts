import { test, expect, type Page } from '../fixtures';

// The header search is live: results appear under the box and change with every letter, they can be
// picked with the keyboard, and Enter / the button still go to the full results page. Real books are
// read; nothing is written.

const SEARCH = 'ابحث في الكتب';
/** The header's own box (the mobile menu has another one). */
const headerBox = (page: Page) => page.locator('form.site-search').getByRole('combobox', { name: SEARCH });

/** A real book's title, read the way the storefront reads it. */
async function aTitle(page: Page): Promise<string> {
  await page.goto('/');
  return page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const { data } = await supabase.from('products_public_catalog').select('title').not('title', 'is', null).limit(40);
    const titles = ((data ?? []) as { title: string }[]).map((r) => r.title.trim()).filter((t) => t.split(/\s+/)[0].length >= 3);
    return titles.find((t) => /\s/.test(t)) ?? titles[0];
  });
}

/** Home loaded, books in memory: typing now has something to search. */
async function ready(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('article.book-card').first()).toBeVisible({ timeout: 20_000 });
}

const panel = (page: Page) => page.getByTestId('live-search-panel');
const found = async (page: Page) => Number(/(\d+) نتيجة/.exec(await panel(page).getByRole('status').textContent() ?? '')?.[1] ?? 0);

test('منطق البحث: التشكيل والهمزة والتاء المربوطة والأرقام وترتيب الكلمات ما بيفرقوش', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const { normalizeSearchText, matchesSearch, searchProducts } = await import('/src/lib/search.ts');
    const book = { title: 'النحو بين يديك الجزء الأول', author: 'أيمن أمين عبدالغني', category_name: 'سلسلة النحو بين يديك', type: 'ورقي', description: 'مدرسة الفتح' };
    return {
      marks: normalizeSearchText('الْفِقْهُ'),
      hamza: normalizeSearchText('أحمد إبراهيم آمنة'),
      ta: normalizeSearchText('مدرسة') === normalizeSearchText('مدرسه'),
      ya: normalizeSearchText('مصطفى') === normalizeSearchText('مصطفي'),
      digits: normalizeSearchText('الجزء ٣ و ۴'),
      order: matchesSearch(book, 'الجزء الاول النحو'),
      author: matchesSearch(book, 'ايمن'),
      description: matchesSearch(book, 'مدرسه'),
      wrong: matchesSearch(book, 'جزء ثاني'),
      empty: matchesSearch(book, '   '),
      ranked: searchProducts([
        { title: 'قصص الأنبياء', author: 'النحو' },
        { title: 'النحو الواضح', author: 'x' },
        { title: 'شرح النحو', author: 'x' },
      ], 'نحو').map((b) => b.title),
    };
  });
  expect(r.marks).toBe('الفقه');
  expect(r.hamza).toBe('احمد ابراهيم امنه');
  expect(r.ta).toBe(true);
  expect(r.ya).toBe(true);
  expect(r.digits).toBe('الجزء 3 و 4');
  expect(r.order).toBe(true);
  expect(r.author).toBe(true);
  expect(r.description).toBe(true);
  expect(r.wrong).toBe(false);
  expect(r.empty).toBe(false);
  // A title that starts with the word (not counting the article) first, then one containing it, then a match only in the author.
  expect(r.ranked).toEqual(['النحو الواضح', 'شرح النحو', 'قصص الأنبياء']);
});

test('البحث حي: النتائج بتظهر وتتغير مع كل حرف وتضيق كل ما الكلمة تطول', async ({ page }) => {
  const title = await aTitle(page);
  const word = title.split(/\s+/)[0];
  await ready(page);
  const box = headerBox(page);

  const counts: number[] = [];
  for (let i = 1; i <= word.length; i++) {
    await box.fill(word.slice(0, i));
    await expect(panel(page)).toBeVisible();
    counts.push(await found(page));
  }
  expect(counts[0], 'أول حرف بيجيب نتايج').toBeGreaterThan(0);
  // A longer word can only match fewer (or as many) books.
  counts.slice(1).forEach((c, i) => expect(c, `بعد الحرف ${i + 2}`).toBeLessThanOrEqual(counts[i]));

  // The whole title finds that book, with its author and price.
  await box.fill(title);
  await expect(panel(page).getByRole('option').first()).toBeVisible();
  await expect(panel(page)).toContainText(title);
  await expect(panel(page).locator('.live-search__price').first()).toContainText('ج');
});

test('لا توجد نتائج: رسالة واضحة، والمسح يقفل القايمة', async ({ page }) => {
  await ready(page);
  const box = headerBox(page);
  await box.fill('ءءءظظظ');
  await expect(panel(page)).toContainText('لا توجد نتائج لـ «ءءءظظظ»');
  await expect(panel(page).getByRole('link', { name: 'تصفّح كل الكتب' })).toBeVisible();

  await page.locator('form.site-search').getByRole('button', { name: 'مسح البحث' }).click();
  await expect(box).toHaveValue('');
  await expect(panel(page)).toHaveCount(0);
});

test('الكيبورد: الأسهم بتختار، Enter على نتيجة يفتح الكتاب، وEnter من غير اختيار يفتح كل النتائج', async ({ page }) => {
  const title = await aTitle(page);
  await ready(page);
  const box = headerBox(page);

  await box.fill(title.split(/\s+/)[0]);
  await expect(panel(page).getByRole('option').first()).toBeVisible();
  await box.press('ArrowDown');
  await expect(panel(page).getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await box.press('ArrowDown');
  await expect(panel(page).getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await box.press('ArrowUp');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/book\/[0-9a-f-]{36}/);
  await expect(panel(page)).toHaveCount(0);

  // Nothing picked: Enter goes to the results page with the query.
  await ready(page);
  await box.fill('النحو');
  await expect(panel(page)).toBeVisible();
  await box.press('Enter');
  await expect(page).toHaveURL(/\/books\?q=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get('q') ?? '')).toBe('النحو');
});

test('الإغلاق: Escape وضغطة برّه بيقفلوا القايمة، والتركيز يرجّعها', async ({ page }) => {
  await ready(page);
  const box = headerBox(page);
  await box.fill('كتاب');
  await expect(panel(page)).toBeVisible();
  await box.press('Escape');
  await expect(panel(page)).toHaveCount(0);

  await box.focus();
  await box.press('End');
  await page.keyboard.type('ا');
  await expect(panel(page)).toBeVisible();
  await page.locator('h1, main').first().click({ position: { x: 5, y: 5 }, force: true });
  await expect(panel(page)).toHaveCount(0);
});

test('القايمة بتفضل جوه الشاشة وفوق الهيدر على الكمبيوتر', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  await headerBox(page).fill('ا');
  await expect(panel(page)).toBeVisible();
  const box = await panel(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
  expect(box!.y).toBeGreaterThan(40);
  expect(box!.y + box!.height).toBeLessThanOrEqual(800);
  // It is on top: the row under its middle belongs to the list, not to the page behind.
  const top = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-testid="live-search-panel"]'), { x: box!.x + box!.width / 2, y: box!.y + 40 });
  expect(top).toBe(true);
});

test('الموبايل: البحث جوه القايمة حي، والاختيار بيقفل القايمة', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  const drawerSearch = page.locator('.mobile-nav-drawer__search');
  await expect(drawerSearch).toBeVisible();
  await drawerSearch.getByRole('combobox').fill('ا');
  const list = page.locator('.live-search__panel--drawer');
  await expect(list.getByRole('option').first()).toBeVisible();
  const inside = await list.boundingBox();
  expect(inside!.x + inside!.width).toBeLessThanOrEqual(390);
  await list.getByRole('option').first().click();
  await expect(page).toHaveURL(/\/book\//);
  await expect(page.locator('.mobile-nav-drawer')).not.toHaveClass(/mobile-nav-drawer--open/);
});

test('صفحة الكتب: البحث بيتجاهل التشكيل واختلاف الهمزة', async ({ page }) => {
  const title = await aTitle(page);
  const word = title.split(/\s+/)[0];
  // The same word typed with a vowel mark and the alef spelled with a hamza.
  const variant = word.replace(/ا/g, 'أ').replace(/^(.)/, '$1َ');
  await page.goto(`/books?q=${encodeURIComponent(variant)}`);
  await expect(page.getByText(/\d+ كتاب مطابق/).first()).not.toContainText('0 كتاب', { timeout: 20_000 });
  await expect(page.locator('article.book-card').first()).toBeVisible();
});

test('الموبايل: القايمة الجانبية بتتفتح كاملة بطول الشاشة (مش متقصوصة على شريط الهيدر)', async ({ page }) => {
  // The header has a backdrop-filter, which would make it the containing block of the fixed menu and
  // cut it to the header's own height, leaving only the logo strip on screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  const overlay = page.locator('.mobile-nav-overlay');
  await expect(overlay).toHaveClass(/mobile-nav-overlay--open/);
  const box = await overlay.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(840);
  // The menu slides in: measure once it has stopped.
  await expect.poll(() => page.locator('.mobile-nav-drawer').evaluate((el) => getComputedStyle(el).transform), { timeout: 5_000 })
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

  // The last link is on screen and is what a tap on it would hit (nothing of the page is in front).
  const last = page.locator('.mobile-nav-drawer').getByRole('link', { name: 'دخول' });
  await expect(last).toBeVisible();
  const lastBox = await last.boundingBox();
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(844);
  const hit = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.mobile-nav-drawer'), { x: lastBox!.x + lastBox!.width / 2, y: lastBox!.y + lastBox!.height / 2 });
  expect(hit).toBe(true);
});
