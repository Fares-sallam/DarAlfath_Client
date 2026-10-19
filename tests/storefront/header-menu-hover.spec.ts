import { test, expect, type Locator, type Page } from '../fixtures';

// The header's series menus open on hover. Moving the mouse from the series name down to its menu, and
// from a category across to its book list, crosses a few pixels of empty space on the way; the menu has
// to stay open through that, even when the mouse is slow, and without a click. The mouse here is a real
// one (page.mouse), moved a few pixels at a time. The series and their books are answered in flight;
// nothing is written anywhere.

async function withTwoSeries(page: Page) {
  const series = [
    { id: 'series-1', name: 'سلسلة اختبار أولى', products: ['a1', 'a2', 'a3'] },
    { id: 'series-2', name: 'سلسلة اختبار ثانية', products: ['b1', 'b2', 'b3'] },
  ];
  await page.route('**/rest/v1/book_series*', (route) =>
    route.request().method() !== 'GET' ? route.fallback() : route.fulfill({
      json: series.map((s, i) => ({
        id: s.id, name: s.name, description: null, cover_url: null, sort_order: i,
        product_series: s.products.map((product_id) => ({ product_id })),
      })),
    }));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: series.flatMap((s) => s.products).map((product_id, i) => ({
        product_id, title: `كتاب ${product_id}`, author: 'مؤلف', category_slug: `cat-${product_id}`, category_name: `تصنيف ${product_id}`,
        country_code: 'EG', min_price: 50, starting_price: 50, images: [], created_at: `2026-01-0${i + 1}T00:00:00Z`,
      })),
    }));
  await page.route('**/rest/v1/product_categories*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/categories*', (route) => route.fulfill({ json: [] }));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/contact', { waitUntil: 'domcontentloaded' });
  const first = page.locator('.nav-dropdown', { hasText: 'سلسلة اختبار أولى' });
  const second = page.locator('.nav-dropdown', { hasText: 'سلسلة اختبار ثانية' });
  await expect(first).toBeVisible({ timeout: 20_000 });
  await expect(first.locator('.nav-dropdown__item')).toHaveCount(3);
  await page.waitForTimeout(500); // the flip measurement settles
  return { first, second };
}

const box = async (el: Locator) => (await el.boundingBox())!;
const visibility = (el: Locator) => el.evaluate((node) => getComputedStyle(node).visibility);
/** Moves the real mouse to a point in a few steps, like a hand does. */
const moveTo = (page: Page, x: number, y: number) => page.mouse.move(x, y, { steps: 6 });
/** Longer than any grace the menu may give, so what's left is what the layout itself holds open. */
const LONGER_THAN_ANY_GRACE = 900;

test('القايمة بتفضل مفتوحة وإنت نازل من اسم السلسلة ليها، حتى لو بطيء وبدون كليك', async ({ page }) => {
  const { first } = await withTwoSeries(page);
  const menu = first.locator('.nav-dropdown__menu');
  const trigger = await box(first.locator('.nav-dropdown__trigger'));
  await moveTo(page, trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
  await expect(menu).toHaveCSS('opacity', '1');

  // The mouse stops in the space between the name and the menu and rests there.
  const wrapper = await box(first);
  const menuBox = await box(menu);
  const gapY = (wrapper.y + wrapper.height + menuBox.y) / 2;
  expect(gapY, 'there is a gap to cross').toBeGreaterThan(wrapper.y + wrapper.height - 1);
  await moveTo(page, trigger.x + trigger.width / 2, gapY);
  await page.waitForTimeout(LONGER_THAN_ANY_GRACE);
  await expect(menu).toHaveCSS('opacity', '1');
  expect(await visibility(menu)).toBe('visible');

  // Then it goes on into the menu, which is still there to be used (no click anywhere).
  const row = await box(first.locator('.nav-dropdown__row').first());
  await moveTo(page, row.x + row.width / 2, row.y + row.height / 2);
  await expect(menu).toHaveCSS('opacity', '1');
  await expect(first.locator('.nav-dropdown__item').first().locator('.nav-dropdown__submenu')).toHaveCSS('opacity', '1');
});

/** Hover a category in `menu`, rest the mouse on the space between it and its book list, then go into the list. */
async function crossToBookList(page: Page, menu: Locator) {
  const item = menu.locator('.nav-dropdown__item').first();
  const flyout = item.locator('.nav-dropdown__submenu');
  const trigger = await box(menu.locator('.nav-dropdown__trigger'));
  await moveTo(page, trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
  const row = await box(item.locator('.nav-dropdown__row'));
  await moveTo(page, row.x + row.width / 2, row.y + row.height / 2);
  await expect(flyout).toHaveCSS('opacity', '1');

  // Between the category row and its book list: the mouse rests on the space between them.
  const itemBox = await box(item);
  const flyBox = await box(flyout);
  const flyoutIsLeft = flyBox.x < itemBox.x;
  const gapX = flyoutIsLeft ? (flyBox.x + flyBox.width + itemBox.x) / 2 : (itemBox.x + itemBox.width + flyBox.x) / 2;
  await moveTo(page, gapX, row.y + row.height / 2);
  await page.waitForTimeout(LONGER_THAN_ANY_GRACE);
  await expect(flyout).toHaveCSS('opacity', '1');
  expect(await visibility(flyout)).toBe('visible');

  // And it is reachable: the mouse ends on a book in it, and both lists are still open.
  const link = await box(flyout.locator('a').first());
  await moveTo(page, link.x + link.width / 2, link.y + link.height / 2);
  await expect(flyout).toHaveCSS('opacity', '1');
  await expect(menu.locator('.nav-dropdown__menu')).toHaveCSS('opacity', '1');
  return flyoutIsLeft;
}

test('نافذة كتب التصنيف بتفضل مفتوحة وإنت رايح لها من التصنيف، حتى لو بطيء', async ({ page }) => {
  const { first } = await withTwoSeries(page);
  expect(await crossToBookList(page, first)).toBe(true); // opens beside the menu, to its left
});

test('نفس الشيء للقايمة اللي نافذتها بتفتح على الناحية التانية (آخر سلسلة في الصف)', async ({ page }) => {
  const { second } = await withTwoSeries(page);
  // The page puts this class on the series at the far end of the row (it measures where there is room).
  await second.evaluate((el) => el.classList.add('nav-dropdown--flip'));
  expect(await crossToBookList(page, second)).toBe(false); // opens on the other side
});

test('قايمة واحدة بس مفتوحة: لما تروح لسلسلة تانية الأولى بتتقفل على طول، ولما تمشي من الهيدر كله بتتقفل', async ({ page }) => {
  const { first, second } = await withTwoSeries(page);
  const a = await box(first.locator('.nav-dropdown__trigger'));
  await moveTo(page, a.x + a.width / 2, a.y + a.height / 2);
  await expect(first.locator('.nav-dropdown__menu')).toHaveCSS('opacity', '1');

  const b = await box(second.locator('.nav-dropdown__trigger'));
  await moveTo(page, b.x + b.width / 2, b.y + b.height / 2);
  await expect(second.locator('.nav-dropdown__menu')).toHaveCSS('opacity', '1');
  // The first one doesn't hang around under the second.
  expect(await visibility(first.locator('.nav-dropdown__menu'))).toBe('hidden');

  // Leaving the header altogether closes it (after its moment of grace), and it can't be hit once closed.
  await moveTo(page, 200, 700);
  await expect.poll(() => visibility(second.locator('.nav-dropdown__menu')), { timeout: 3000 }).toBe('hidden');
});
