import { test, expect, type Page } from '../fixtures';

// The top menu is one row, always: as entries are added the type, padding and gaps shrink together until everything fits,
// instead of the last entries dropping to a second line. Answered by the test; nothing is written.

const NOW = '2026-01-01T00:00:00Z';
const node = (id: string, name: string, sort: number) => ({
  id, parent_id: null, type: 'series', name_ar: name, name_en: null, slug: id,
  description_ar: null, description_en: null, image_url: null, icon: null, color: null,
  is_active: true, featured: false, show_web: true, show_app: true, sort_web: sort, sort_app: sort,
  show_in_menu_web: true, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
  books_sort_web: 'title', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null,
  intro_ar: null, intro_en: null, video_url: null, page_layout: 'auto', strips_limit: 12, show_as_strip: true,
  legacy_table: null, legacy_id: null, created_at: NOW, updated_at: NOW,
});
const row = (id: string, over: Record<string, unknown>) => ({
  id, channel: 'web', parent_id: null, kind: 'node', node_id: null, label_ar: null, label_en: null, url: null,
  sort_order: 0, visible: true, auto_children: false, created_at: NOW, updated_at: NOW, ...over,
});

async function stubMenu(page: Page, seriesCount: number) {
  const nodes = Array.from({ length: seriesCount }, (_, i) => node(`s${i + 1}`, `إصدارات الدار رقم ${i + 1}`, i));
  const items = [
    row('home', { kind: 'home', sort_order: 0 }),
    ...nodes.map((n, i) => row(`m${i + 1}`, { node_id: n.id, sort_order: i + 1 })),
    row('contact', { kind: 'contact', sort_order: seriesCount + 1 }),
  ];
  const links = nodes.map((n) => ({ product_id: 'b1', node_id: n.id, is_primary: false, sort_order: 0 }));
  await page.route('**/rest/v1/menu_items*', (route) => route.fulfill({ json: items }));
  await page.route('**/rest/v1/catalog_nodes*', (route) => route.fulfill({ json: nodes }));
  await page.route('**/rest/v1/product_nodes*', (route) => route.fulfill({ json: links }));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: [{ product_id: 'b1', title: 'كتاب', author: 'مؤلف', category_slug: 'x', category_name: 'x', country_code: 'EG', min_price: 50, max_price: 50, starting_price: 50, images: [] }],
    }));
}

const nav = (page: Page) => page.locator('.site-header__nav');
const scale = (page: Page) => nav(page).evaluate((el) => Number(el.style.getPropertyValue('--nav-scale') || '1'));
/** the vertical position of every entry on the row: one row means one value */
const tops = (page: Page) =>
  nav(page).locator(':scope > *').evaluateAll((els) => [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().top)))]);
const fits = (page: Page) => nav(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1);

test('قليل من العناصر: سطر واحد والخط على حجمه الطبيعي', async ({ page }) => {
  await stubMenu(page, 2);
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/contact');
  await expect(nav(page).getByRole('link', { name: 'إصدارات الدار رقم 2' })).toBeVisible({ timeout: 20_000 });
  expect(await scale(page)).toBe(1);
  expect(await tops(page)).toHaveLength(1);
  expect(await nav(page).locator(':scope > a').first().evaluate((el) => getComputedStyle(el).fontSize)).toBe('15.2px');
});

test('لما العدد يكبر: يفضل سطر واحد، والخط والمسافات بتصغر لحد ما يتسع', async ({ page }) => {
  await stubMenu(page, 9);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/contact');
  await expect(nav(page).getByRole('link', { name: 'إصدارات الدار رقم 9' })).toBeVisible({ timeout: 20_000 });
  expect(await tops(page)).toHaveLength(1);
  expect(await fits(page)).toBe(true);
  const s = await scale(page);
  expect(s).toBeLessThan(1);
  expect(s).toBeGreaterThanOrEqual(0.7);
  const size = Number((await nav(page).locator(':scope > a').first().evaluate((el) => getComputedStyle(el).fontSize)).replace('px', ''));
  expect(size).toBeCloseTo(15.2 * s, 1);
});

test('الشاشة بتكبر وتصغر: الحجم بيتظبط من جديد، وسطر واحد دايمًا', async ({ page }) => {
  await stubMenu(page, 9);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/contact');
  await expect(nav(page).getByRole('link', { name: 'إصدارات الدار رقم 9' })).toBeVisible({ timeout: 20_000 });
  const narrow = await scale(page);
  expect(await tops(page)).toHaveLength(1);

  await page.setViewportSize({ width: 1700, height: 800 });
  await expect.poll(() => scale(page)).toBeGreaterThan(narrow);
  expect(await tops(page)).toHaveLength(1);
  expect(await fits(page)).toBe(true);
});

test('عدد كبير جدًا: لسه سطر واحد (بأصغر حجم مقروء)، مفيش سطر تاني', async ({ page }) => {
  await stubMenu(page, 16);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/contact');
  await expect(nav(page).getByRole('link', { name: 'إصدارات الدار رقم 16' })).toBeVisible({ timeout: 20_000 });
  expect(await tops(page)).toHaveLength(1);
  expect(await scale(page)).toBe(0.7);
});
