import { test, expect } from '@playwright/test';

// The header's series menus (سلسلة الفتح الرباني، قصص وموسوعات...) list every
// category of the series. They used to stop at the first 8. Read-only.

test('قايمة السلسلة بتعرض كل تصنيفاتها مش أول ٨ بس', async ({ page }) => {
  const CATEGORIES = 12;
  const ids = Array.from({ length: CATEGORIES }, (_, i) => `p${i + 1}`);

  // One series with a book in each of 12 different categories.
  await page.route('**/rest/v1/book_series*', (route) =>
    route.request().method() !== 'GET' ? route.fallback() : route.fulfill({
      json: [{ id: 'series-1', name: 'سلسلة اختبار', description: null, cover_url: null, sort_order: 0, product_series: ids.map((product_id) => ({ product_id })) }],
    }));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: ids.map((product_id, i) => ({
        product_id, title: `كتاب ${i + 1}`, author: 'مؤلف', category_slug: `cat-${i + 1}`, category_name: `تصنيف ${i + 1}`, country_code: 'EG',
        min_price: 50, starting_price: 50, images: [],
      })),
    }));
  await page.route('**/rest/v1/product_categories*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/categories*', (route) => route.fulfill({ json: [] }));

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/contact', { waitUntil: 'domcontentloaded' });
  const menu = page.locator('.nav-dropdown', { hasText: 'سلسلة اختبار' });
  await expect(menu).toBeVisible({ timeout: 20_000 });
  await expect(menu.locator('.nav-dropdown__item')).toHaveCount(CATEGORIES);

  // Every one is reachable: the whole list fits on a short screen.
  await menu.hover();
  const box = (await menu.locator('.nav-dropdown__menu').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  await expect(menu.locator('.nav-dropdown__item').last()).toBeVisible();
});

test('بيانات المتجر الحقيقية: أكبر سلسلة قايمتها كاملة وكتب آخر تصنيف ظاهرة جوه الشاشة', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const menus = page.locator('.nav-dropdown');
  await expect(menus.first()).toBeVisible({ timeout: 20_000 });
  // Categories load a moment after the series, so wait for the menus to settle.
  await page.waitForTimeout(1500);

  // The series with the most categories.
  const counts = await menus.evaluateAll((els) => els.map((el) => el.querySelectorAll('.nav-dropdown__item').length));
  const biggest = Math.max(...counts);
  test.skip(biggest <= 8, 'مفيش سلسلة فيها أكتر من ٨ تصنيفات');
  const menu = menus.nth(counts.indexOf(biggest));
  expect(biggest).toBeGreaterThan(8);

  // Every category is a row you can reach: the whole menu fits on screen...
  await menu.hover();
  await expect(menu.locator('.nav-dropdown__menu')).toHaveCSS('opacity', '1');
  const box = (await menu.locator('.nav-dropdown__menu').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(720);

  // ...and the books list next to the last one opens inside the screen too.
  const last = menu.locator('.nav-dropdown__item').last();
  const row = (await last.locator('.nav-dropdown__row').boundingBox())!;
  await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2, { steps: 5 });
  const flyout = last.locator('.nav-dropdown__submenu');
  await expect(flyout).toHaveCSS('opacity', '1');
  const fly = (await flyout.boundingBox())!;
  expect(fly.y).toBeGreaterThanOrEqual(0);
  expect(fly.y + fly.height).toBeLessThanOrEqual(720);
  expect(fly.x).toBeGreaterThanOrEqual(0);
  expect(fly.x + fly.width).toBeLessThanOrEqual(1280);
});

test('قوايم الكتب الجانبية في الهيدر مبتطلعش برا الشاشة، ومفيش سكرول أفقي', async ({ page }) => {
  for (const width of [1280, 1440, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.nav-dropdown').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);

    // Even the hidden ones count: a list past the edge widens the page.
    const edges = await page.evaluate(() => {
      const rects = Array.from(document.querySelectorAll('.nav-dropdown__submenu')).map((el) => el.getBoundingClientRect());
      return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)), width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
    });
    expect(edges.left, `${width}px: a list starts left of the screen`).toBeGreaterThanOrEqual(-1);
    expect(edges.right, `${width}px: a list ends right of the screen`).toBeLessThanOrEqual(edges.width + 1);
    expect(edges.scroll, `${width}px: the page scrolls sideways`).toBeLessThanOrEqual(edges.width + 1);
  }
});
