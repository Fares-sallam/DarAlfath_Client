import { test, expect, type Page } from '../fixtures';

// «أقسام المتجر» on the home page: the cards are the existing nodes the dashboard's «أقسام المتجر» tab chose, in its order, each with
// its picture; a card whose node is switched off for the website (or empty and set to hide when empty) is left out; when the list
// can't be read every series is drawn, as before. The dashboard's unsaved list arrives by message in the preview. The tree and the
// list are answered by the test; nothing is written.

const NOW = '2026-01-01T00:00:00Z';
const node = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, parent_id: null, type: 'series', name_ar: name, name_en: null, slug: id, description_ar: null, description_en: null, image_url: null, icon: null, color: null,
  is_active: true, featured: false, show_web: true, show_app: true, sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: false, show_in_bar_app: false,
  hide_when_empty: true, books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null,
  intro_ar: null, intro_en: null, video_url: null, page_layout: 'auto', strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null, created_at: NOW, updated_at: NOW, ...over,
});

// ids look like uuids because the preview bridge only takes those
const ID = { a: '11111111-1111-4111-8111-111111111111', b: '22222222-2222-4222-8222-222222222222', c: '33333333-3333-4333-8333-333333333333', d: '44444444-4444-4444-8444-444444444444', e: '55555555-5555-4555-8555-555555555555', f: '66666666-6666-4666-8666-666666666666' };

const NODES = [
  node(ID.a, 'سلسلة أ', { sort_web: 0, image_url: 'https://img.test/a.png' }),
  node(ID.b, 'سلسلة ب', { sort_web: 1 }),
  node(ID.c, 'تصنيف ج', { type: 'category', slug: 'cat-c', sort_web: 2, image_url: 'https://img.test/c.png' }),
  node(ID.d, 'سلسلة مخفية عن الموقع', { sort_web: 3, show_web: false }),
  node(ID.e, 'سلسلة فاضية', { sort_web: 4 }),
  node(ID.f, 'قسم ف', { type: 'section', slug: 'sec-f', sort_web: 5 }),
];
const link = (product_id: string, node_id: string) => ({ product_id, node_id, is_primary: false, sort_order: 0 });
// everything holds a book except the empty series
const LINKS = [ID.a, ID.b, ID.c, ID.d, ID.f].map((id) => link('b1', id));

async function stub(page: Page, saved: string[] | 'error' = [ID.c, ID.a, ID.f, ID.e, ID.b, ID.d]) {
  await page.route('**/rest/v1/catalog_nodes*', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: NODES })));
  await page.route('**/rest/v1/product_nodes*', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: LINKS })));
  await page.route('**/rest/v1/menu_items*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/store_departments*', (route) =>
    saved === 'error'
      ? route.fulfill({ status: 404, json: { code: '42P01', message: 'relation "store_departments" does not exist' } })
      : route.fulfill({ json: saved.map((node_id, sort_order) => ({ node_id, sort_order })) }));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: [{ product_id: 'b1', title: 'كتاب', author: 'مؤلف', category_slug: 'x', category_name: 'x', country_code: 'EG', min_price: 50, max_price: 50, starting_price: 50, images: [] }],
    }));
}

const section = (page: Page) => page.locator('.store-departments');
const labels = (page: Page) => section(page).locator('.department-card__label');
const send = (page: Page, message: Record<string, unknown>) => page.evaluate((m) => window.postMessage({ type: 'daralfath:display-preview', ...m }, window.location.origin), message);

test('الكروت: اللي اختارته اللوحة بترتيبها، والمخفي عن الموقع والفاضي مبيظهروش، والتصنيف والقسم بيفتحوا صفحتهم', async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(labels(page).first()).toBeVisible({ timeout: 20_000 });
  // the list's order (ج، أ، ف، فاضية، ب، مخفية), minus the empty series and the one hidden from the website
  await expect(labels(page)).toHaveText(['تصنيف ج', 'سلسلة أ', 'قسم ف', 'سلسلة ب']);

  await expect(section(page).locator('a.department-card').nth(0)).toHaveAttribute('href', `/books?node=${ID.c}`);
  await expect(section(page).locator('a.department-card').nth(1)).toHaveAttribute('href', `/books?series=${ID.a}`);
  await expect(section(page).locator('a.department-card').nth(2)).toHaveAttribute('href', `/books?node=${ID.f}`);
});

test('الكروت: صورة الكارت هي صورة العنصر، ومن غير صورة بتظهر أيقونة', async ({ page }) => {
  await stub(page);
  await page.goto('/');
  await expect(labels(page).first()).toBeVisible({ timeout: 20_000 });
  await expect(section(page).locator('.department-card').nth(0).locator('img')).toHaveAttribute('src', 'https://img.test/c.png');
  await expect(section(page).locator('.department-card').nth(1).locator('img')).toHaveAttribute('src', 'https://img.test/a.png');
  await expect(section(page).locator('.department-card').nth(2).locator('.department-card__fallback')).toBeVisible();
});

test('الكروت: سلسلة جديدة مش في القايمة مبتظهرش لوحدها', async ({ page }) => {
  await stub(page, [ID.a]);
  await page.goto('/');
  await expect(labels(page).first()).toBeVisible({ timeout: 20_000 });
  await expect(labels(page)).toHaveText(['سلسلة أ']);
});

test('لو القايمة مش بتتقري: كل السلاسل زي الأول', async ({ page }) => {
  await stub(page, 'error');
  await page.goto('/');
  await expect(labels(page).first()).toBeVisible({ timeout: 20_000 });
  // every series with books (the empty one and the one hidden from the website are still left out)
  await expect(labels(page)).toHaveText(['سلسلة أ', 'سلسلة ب']);
});

test('قايمة فاضية: الشريط كله مبيظهرش ومبياخدش مكان', async ({ page }) => {
  await stub(page, []);
  await page.goto('/');
  await expect(page.locator('.site-header')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(section(page)).toHaveCount(0);
});

test('المعاينة: قايمة اللوحة اللي لسه متحفظتش بترتيبها وصورها، ورجوع للمحفوظة', async ({ page }) => {
  await stub(page, [ID.a, ID.b]);
  await page.goto('/?preview=display');
  await expect(labels(page)).toHaveText(['سلسلة أ', 'سلسلة ب'], { timeout: 20_000 });

  await send(page, { departments: { ids: [ID.b, ID.c, ID.a], images: { [ID.b]: 'https://img.test/new-b.png', [ID.a]: null, 'not-an-id': 'https://evil.test/x.png' } } });
  await expect(labels(page)).toHaveText(['سلسلة ب', 'تصنيف ج', 'سلسلة أ']);
  await expect(section(page).locator('.department-card').nth(0).locator('img')).toHaveAttribute('src', 'https://img.test/new-b.png');
  // a picture taken off in the draft shows the icon, a node without a draft picture keeps its own
  await expect(section(page).locator('.department-card').nth(2).locator('.department-card__fallback')).toBeVisible();
  await expect(section(page).locator('.department-card').nth(1).locator('img')).toHaveAttribute('src', 'https://img.test/c.png');

  // a message that says nothing about the list leaves it; null goes back to the saved one
  await send(page, { scroll: 'top' });
  await page.waitForTimeout(500);
  await expect(labels(page)).toHaveText(['سلسلة ب', 'تصنيف ج', 'سلسلة أ']);
  await send(page, { departments: null });
  await expect(labels(page)).toHaveText(['سلسلة أ', 'سلسلة ب']);
});

test('المعاينة: عنوان غير آمن للصورة أو معرّف غلط مبيتاخدوش', async ({ page }) => {
  await stub(page, [ID.a]);
  await page.goto('/?preview=display');
  await expect(labels(page)).toHaveText(['سلسلة أ'], { timeout: 20_000 });
  await send(page, { departments: { ids: [ID.a, 'x'.repeat(36), 'javascript:alert(1)'], images: { [ID.a]: 'javascript:alert(1)' } } });
  await expect(labels(page)).toHaveText(['سلسلة أ']);
  // an address that is not https is dropped, so the card shows its icon rather than a picture
  await expect(section(page).locator('.department-card').first().locator('img')).toHaveCount(0);
});

test('المعاينة: «scroll: departments» بتوصّل للكروت حتى لو اتحمّلت بعد الرسالة', async ({ page }) => {
  await stub(page, [ID.a]);
  // the cards' list arrives late, after the dashboard's message
  await page.route('**/rest/v1/store_departments*', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({ json: [{ node_id: ID.a, sort_order: 0 }] });
  });
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/?preview=display');
  await send(page, { scroll: 'departments' });
  await expect(labels(page)).toHaveText(['سلسلة أ'], { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => {
    const r = document.querySelector('.store-departments')!.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  }), { timeout: 15_000 }).toBe(true);
});
