import { test, expect, type Page, type Route } from '../fixtures';

// The card and book page's wording and price ("طبعة", "يبدأ من", the old price struck in red), the share
// buttons, the banner's 5 seconds, the title boxes gone from the books and categories pages, and the
// videos on a sideways shelf. Real data is read; where a case needs a particular book (several editions,
// a discount) the catalog response is rewritten in flight. Nothing is written anywhere.

type Row = Record<string, unknown> & { product_id: string; title: string };

/** Opens /books with the first three catalog rows made into three known books. */
async function booksWithKnownCards(page: Page) {
  let rows: Row[] = [];
  await page.route('**/rest/v1/products_public_catalog*', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const json = (await response.json()) as Row[];
    rows = json.map((row, i) => {
      if (i === 0) return { ...row, title: 'كتاب اختبار ثلاث طبعات', variant_count: 3, min_price: 80, max_price: 120, starting_price: 80, old_price: 100, max_discount_pct: 20 };
      if (i === 1) return { ...row, title: 'كتاب اختبار طبعة واحدة', variant_count: 1, min_price: 50, max_price: 50, starting_price: 50, old_price: null, max_discount_pct: 0 };
      if (i === 2) return { ...row, title: 'كتاب اختبار طبعتين', variant_count: 2, min_price: 60, max_price: 60, starting_price: 60, old_price: null, max_discount_pct: 0 };
      return row;
    });
    return route.fulfill({ response, json: rows });
  });
  await page.goto('/books');
  await expect(page.locator('article.book-card').first()).toBeVisible({ timeout: 20_000 });
  return rows;
}

const card = (page: Page, title: string) => page.getByRole('button', { name: `فتح صفحة ${title}` });

test('الكارت: «طبعة» بدل «نسخة»، و«يبدأ من» بأقل سعر لما يكون فيه أكتر من طبعة، والقديم مشطوب بالأحمر', async ({ page }) => {
  await booksWithKnownCards(page);

  const three = card(page, 'كتاب اختبار ثلاث طبعات');
  await expect(three.locator('.book-card__variants-count')).toHaveText('٣ طبعات');
  await expect(three.locator('.book-card__from')).toHaveText('يبدأ من');
  await expect(three.locator('.book-card__price strong')).toContainText('٨٠');
  const was = three.locator('del.price-was');
  await expect(was).toContainText('١٠٠');
  // The colour as drawn (the stylesheet writes it in oklch), read back as red/green/blue.
  const [r, g, b] = await was.evaluate((el) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = getComputedStyle(el).color;
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });
  expect(r).toBeGreaterThan(g + 60); // red
  expect(r).toBeGreaterThan(b + 60);
  expect(await was.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('line-through');

  const one = card(page, 'كتاب اختبار طبعة واحدة');
  await expect(one.locator('.book-card__variants-count')).toHaveText('طبعة واحدة');
  await expect(one.locator('.book-card__from')).toHaveCount(0);
  await expect(one.locator('del')).toHaveCount(0);
  await expect(one.locator('.book-card__price strong')).toContainText('٥٠');

  await expect(card(page, 'كتاب اختبار طبعتين').locator('.book-card__variants-count')).toHaveText('طبعتان');
  // No "نسخ" left on any card.
  await expect(page.locator('.book-card__variants-count').filter({ hasText: 'نسخ' })).toHaveCount(0);
});

test('الكارت: زرار المشاركة قصاد القلب، وعلامة الخصم نزلت تحت فمش بتغطي عليه', async ({ page }) => {
  await booksWithKnownCards(page);
  const three = card(page, 'كتاب اختبار ثلاث طبعات');
  await page.waitForLoadState('networkidle');
  // All four measured at the same moment (the page may still shift as it loads).
  const { heart, share, badge, cover } = await three.evaluate((el) => {
    const box = (sel: string) => el.querySelector(sel)!.getBoundingClientRect().toJSON() as DOMRect;
    return { heart: box('.book-card__fav'), share: box('.book-card__share'), badge: box('.book-card__discount-badge'), cover: box('.book-card__cover') };
  });
  // Same row, opposite sides (RTL: heart on the right, share on the left).
  expect(Math.abs(heart!.y - share!.y)).toBeLessThan(2);
  expect(heart!.x).toBeGreaterThan(share!.x + cover!.width / 2);
  // The badge sits at the cover's bottom and doesn't touch the share button.
  expect(badge!.y + badge!.height).toBeGreaterThan(cover!.y + cover!.height - 30);
  expect(badge!.y).toBeGreaterThan(share!.y + share!.height);
});

test('المشاركة من الكارت: بتنسخ رابط الكتاب وبتقول كده، ومن غير ما تفتح الكتاب', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const rows = await booksWithKnownCards(page);
  await card(page, 'كتاب اختبار طبعة واحدة').locator('.book-card__share').click();
  await expect(page.locator('.site-toast')).toHaveText('اتنسخ رابط الكتاب');
  await expect(page).toHaveURL(/\/books$/);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(new RegExp(`^https?://[^/]+/book/${rows[1].product_id}$`));
});

test('صفحة الكتاب: المشاركة جنب القلب، و«اختر الطبعة»، والكتاب اللي ليه طبعة واحدة بتتختار لوحدها', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // A real book sold in exactly one edition (in the country the site opens on).
  let single: Row | undefined;
  await page.route('**/rest/v1/products_public_catalog*', async (route: Route) => {
    const response = await route.fetch();
    const json = (await response.json()) as Row[];
    single ??= json.find((r) => Number(r.variant_count) === 1 && !r.is_bundle);
    return route.fulfill({ response, json });
  });
  await page.goto('/books');
  await expect(page.locator('article.book-card').first()).toBeVisible({ timeout: 20_000 });
  test.skip(!single, 'مفيش كتاب بطبعة واحدة');
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  await page.goto(`/book/${single!.product_id}`);
  const acts = page.locator('.bk3-info__acts');
  await expect(acts.locator('.bk3-heart')).toHaveCount(2); // the heart and the share button, side by side
  await expect(acts.getByRole('button', { name: /^مشاركة رابط/ })).toBeVisible();
  await expect(page.locator('.bk3-variants__hd')).toContainText('اختر الطبعة');
  await expect(page.locator('.bk3-variants__hd small')).toHaveText('طبعة واحدة');
  await expect(page.locator('.bk3-var--on')).toHaveCount(1);
  await expect(page.locator('.bk3-cart-btn')).not.toHaveText(/اختر (نسخة|طبعة)/);

  await acts.getByRole('button', { name: /^مشاركة رابط/ }).click();
  await expect(page.locator('.site-toast')).toHaveText('اتنسخ رابط الكتاب');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/book/${single!.product_id}$`));

  await page.getByRole('button', { name: 'المواصفات' }).click();
  await expect(page.locator('.bk3-specs')).toContainText('عدد الطبعات');
  await expect(page.locator('.bk3-specs')).not.toContainText('النسخ المتاحة');
});

test('البانر بيتغير كل 5 ثواني', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const dots = page.locator('.home-hero-panel__dot');
  await expect(dots.first()).toBeVisible({ timeout: 20_000 });
  test.skip((await dots.count()) < 2, 'البانر فيه صورة واحدة بس');
  await page.mouse.move(5, 5); // hovering the banner pauses it
  await expect(dots.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.clock.runFor(4_500);
  await expect(dots.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.clock.runFor(1_000);
  await expect(dots.nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('مربع «الكتالوج العام» ومربع «التصنيفات والسلاسل» اتشالوا، وكل صفحة ليها عنوان رئيسي واحد', async ({ page }) => {
  await page.goto('/books');
  await expect(page.locator('article.book-card').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('الكتالوج العام')).toHaveCount(0);
  await expect(page.locator('.catalog-hero')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('كل الكتب');

  await page.goto('/categories');
  await expect(page.locator('.taxonomy-card').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.taxonomy-hero')).toHaveCount(0);
  await expect(page.getByText('وصول أسرع للكتب حسب التصنيف')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('التصنيفات');
});

test('الفيديوهات: «فيديوهات تعريفية» في شريط زي الكتب، والمشغّل مش بيتحمّل غير لما تدوس', async ({ page }) => {
  // YouTube itself is not reached from the tests: a still for each picture, an empty page for the player.
  await page.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' }));
  await page.route('https://www.youtube.com/embed/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  let videos: unknown[] = [];
  await page.route('**/rest/v1/intro_videos*', async (route: Route) => {
    const response = await route.fetch();
    videos = (await response.json()) as unknown[];
    return route.fulfill({ response, json: videos });
  });
  await page.goto('/');
  const heading = page.getByRole('heading', { name: 'فيديوهات تعريفية' });
  await expect(heading).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'من الدار' })).toHaveCount(0);

  const rail = page.locator('.video-rail');
  await expect(rail.locator('.video-rail__item')).toHaveCount(videos.length);
  await expect(rail.locator('iframe')).toHaveCount(0);
  // Side by side, each narrower than the page (not one big video at a time).
  const boxes = await rail.locator('.video-rail__item').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  expect(boxes[0].width).toBeLessThan(360);
  if (boxes.length > 1) expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);

  await rail.getByRole('button', { name: /^تشغيل/ }).first().click();
  await expect(rail.locator('iframe')).toHaveCount(1);
  await expect(rail.locator('iframe')).toHaveAttribute('src', /youtube\.com\/embed\/.+autoplay=1/);
  // Starting another one stops the first.
  if (videos.length > 1) {
    await rail.getByRole('button', { name: /^تشغيل/ }).first().click();
    await expect(rail.locator('iframe')).toHaveCount(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
