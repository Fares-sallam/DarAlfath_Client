import { test, expect, type Page } from '../fixtures';

// The top menu as the dashboard's «خريطة العرض» lays it out: a main item opens a menu; a row with something inside opens
// the next menu beside itself, down to the list of a category's books. Answered by the test; nothing is written.

const NOW = '2026-01-01T00:00:00Z';
const node = (over: Record<string, unknown>) => ({
  id: 'x', parent_id: null, type: 'category', name_ar: 'عنصر', name_en: null, slug: 'x',
  description_ar: null, description_en: null, image_url: null, icon: null, color: null,
  is_active: true, featured: false, show_web: true, show_app: true, sort_web: 0, sort_app: 0,
  show_in_menu_web: true, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
  books_sort_web: 'title', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null,
  intro_ar: null, intro_en: null, video_url: null, page_layout: 'auto', strips_limit: 12, show_as_strip: true,
  legacy_table: null, legacy_id: null, created_at: NOW, updated_at: NOW, ...over,
});
const menu = (over: Record<string, unknown>) => ({
  id: 'm', channel: 'web', parent_id: null, kind: 'node', node_id: null, label_ar: null, label_en: null, url: null,
  sort_order: 0, visible: true, auto_children: false, created_at: NOW, updated_at: NOW, ...over,
});

const NODES = [
  node({ id: 'ser', type: 'series', name_ar: 'سلسلة الاختبار', slug: 'ser' }),
  node({ id: 'writing', parent_id: 'ser', name_ar: 'الكتابة', slug: 'writing', sort_web: 0 }),
  node({ id: 'w1', parent_id: 'writing', name_ar: 'خط الرقعة', slug: 'w1', sort_web: 0 }),
  node({ id: 'w2', parent_id: 'writing', name_ar: 'خط النسخ', slug: 'w2', sort_web: 1 }),
  node({ id: 'math', parent_id: 'ser', name_ar: 'الحساب', slug: 'math', sort_web: 1 }),
  node({ id: 'empty', parent_id: 'ser', name_ar: 'تصنيف فاضي', slug: 'empty', sort_web: 2 }),
  node({ id: 'off', parent_id: 'ser', name_ar: 'تصنيف مخفي من القايمة', slug: 'off', sort_web: 3 }),
  node({ id: 'solo', type: 'series', name_ar: 'سلسلة من غير أبناء', slug: 'solo', sort_web: 1 }),
];
const BOOKS = Array.from({ length: 9 }, (_, i) => `b${i + 1}`);
const link = (product_id: string, node_id: string, sort_order = 0) => ({ product_id, node_id, is_primary: false, sort_order });
const LINKS = [
  link('b1', 'w1'), link('b2', 'w1'), link('b3', 'w2'),
  ...['b4', 'b5', 'b6', 'b7', 'b8', 'b9'].map((b) => link(b, 'math')),
  link('b1', 'off'),
  link('b9', 'solo'),
];
const ITEMS = [
  menu({ id: 'home', kind: 'home', sort_order: 0 }),
  menu({ id: 'main-ser', node_id: 'ser', auto_children: true, sort_order: 1 }),
  menu({ id: 'group', parent_id: 'main-ser', kind: 'group', label_ar: 'المواد', sort_order: 0 }),
  menu({ id: 'g-math', parent_id: 'group', node_id: 'math', sort_order: 0 }),
  menu({ id: 'hide-off', parent_id: 'main-ser', node_id: 'off', visible: false, sort_order: 5 }),
  menu({ id: 'ext', parent_id: 'main-ser', kind: 'link', label_ar: 'موقع خارجي', url: 'https://example.com/x', sort_order: 6 }),
  menu({ id: 'main-solo', node_id: 'solo', sort_order: 2 }),
  menu({ id: 'contact', kind: 'contact', sort_order: 3 }),
];

async function stubMenu(page: Page, items = ITEMS) {
  await page.route('**/rest/v1/menu_items*', (route) => route.fulfill({ json: items }));
  await page.route('**/rest/v1/catalog_nodes*', (route) => route.fulfill({ json: NODES }));
  await page.route('**/rest/v1/product_nodes*', (route) => route.fulfill({ json: LINKS }));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: BOOKS.map((product_id, i) => ({
        product_id, title: `كتاب ${i + 1}`, author: 'مؤلف', category_slug: 'math', category_name: 'الحساب',
        country_code: 'EG', min_price: 50, max_price: 50, starting_price: 50, images: [],
      })),
    }));
}

const mainBar = (page: Page) => page.locator('.site-header__nav');

test('القايمة بتتبني من خريطة العرض: الرئيسية، سلسلة بقايمتها، سلسلة من غير أبناء كرابط، تواصل معنا', async ({ page }) => {
  await stubMenu(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/contact');
  const bar = mainBar(page);
  await expect(bar.locator('.nav-dropdown')).toHaveCount(1, { timeout: 20_000 });
  await expect(bar.getByRole('link', { name: 'الرئيسية', exact: true })).toBeVisible();
  await expect(bar.getByRole('link', { name: 'سلسلة من غير أبناء' })).toHaveAttribute('href', '/books?series=solo');
  await expect(bar.getByRole('link', { name: 'تواصل معنا' })).toBeVisible();
  // the order is the map's order
  const labels = await bar.locator(':scope > *').evaluateAll((els) => els.map((el) => el.querySelector('.nav-dropdown__trigger span')?.textContent ?? el.textContent!.trim()));
  expect(labels).toEqual(['الرئيسية', 'سلسلة الاختبار', 'سلسلة من غير أبناء', 'تواصل معنا']);
});

test('قايمة السلسلة: المجموعة والتلقائي مع بعض، المخفي والفاضي مبيظهروش، ورابط خارجي بيتفتح في تاب جديد', async ({ page }) => {
  await stubMenu(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/contact');
  const dropdown = page.locator('.nav-dropdown', { hasText: 'سلسلة الاختبار' });
  await expect(dropdown).toBeVisible({ timeout: 20_000 });
  await dropdown.hover();
  const rows = dropdown.locator('.nav-dropdown__menu > .nav-flyout__item > .nav-dropdown__row');
  // manual rows first (the group, the outside link), then what the tree adds (الكتابة); الحساب moved into the group
  await expect(rows.locator('span')).toHaveText(['المواد', 'موقع خارجي', 'الكتابة']);
  await expect(dropdown.getByText('تصنيف فاضي')).toHaveCount(0);
  await expect(dropdown.getByText('تصنيف مخفي من القايمة')).toHaveCount(0);
  await expect(dropdown.getByRole('link', { name: 'موقع خارجي' })).toHaveAttribute('target', '_blank');
  await expect(dropdown.getByRole('link', { name: 'موقع خارجي' })).toHaveAttribute('href', 'https://example.com/x');
  await expect(dropdown.getByRole('link', { name: 'عرض كل كتب سلسلة الاختبار' }).first()).toHaveAttribute('href', '/books?series=ser');
  // a group is a heading, not a link
  await expect(dropdown.locator('span.nav-dropdown__row', { hasText: 'المواد' })).toBeVisible();
  await expect(dropdown.getByRole('link', { name: /^المواد/ })).toHaveCount(0);
});

test('كل مستوى بيفتح اللي بعده جنبه، ومستوى واحد بس مفتوح في المرة', async ({ page }) => {
  await stubMenu(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/contact');
  const dropdown = page.locator('.nav-dropdown', { hasText: 'سلسلة الاختبار' });
  await expect(dropdown).toBeVisible({ timeout: 20_000 });
  await dropdown.hover();

  const group = dropdown.locator('.nav-flyout__item', { hasText: 'المواد' }).first();
  const writing = dropdown.locator(':scope .nav-dropdown__menu > .nav-flyout__item', { hasText: 'الكتابة' });
  const groupPanel = group.locator(':scope > .nav-flyout__panel');
  const writingPanel = writing.locator(':scope > .nav-flyout__panel');
  await expect(groupPanel).toHaveCSS('opacity', '0');
  await expect(writingPanel).toHaveCSS('opacity', '0');

  // level 2: the group opens what is inside it (الحساب), and a book list beside it
  await group.locator(':scope > .nav-dropdown__row').hover();
  await expect(groupPanel).toHaveCSS('opacity', '1');
  await expect(groupPanel.getByText('الحساب')).toBeVisible();
  const math = groupPanel.locator('.nav-flyout__item', { hasText: 'الحساب' });
  await math.locator(':scope > .nav-dropdown__row').hover();
  const books = math.locator(':scope > .nav-dropdown__submenu');
  await expect(books).toHaveCSS('opacity', '1');
  await expect(books.locator('a:not(.nav-dropdown__view)')).toHaveCount(5); // the first five of its six books
  await expect(books.getByRole('link', { name: 'عرض التصنيف كاملًا' })).toHaveAttribute('href', '/books?node=math');

  // moving to another row closes that one and opens this one
  await writing.locator(':scope > .nav-dropdown__row').hover();
  await expect(writingPanel).toHaveCSS('opacity', '1');
  await expect(groupPanel).toHaveCSS('opacity', '0');
  await expect(writingPanel.getByRole('link', { name: 'عرض كل كتب الكتابة' })).toHaveAttribute('href', '/books?node=writing');

  // level 3: a row inside it opens its own books
  const rokaa = writingPanel.locator('.nav-flyout__item', { hasText: 'خط الرقعة' });
  await rokaa.locator(':scope > .nav-dropdown__row').hover();
  await expect(rokaa.locator(':scope > .nav-dropdown__submenu')).toHaveCSS('opacity', '1');
  await expect(rokaa.locator(':scope > .nav-dropdown__submenu a:not(.nav-dropdown__view)')).toHaveCount(2);
  await rokaa.locator(':scope > .nav-dropdown__submenu').getByRole('link', { name: 'كتاب 1' }).click();
  await expect(page).toHaveURL(/\/book\/b1$/);
});

test('مفيش قايمة محفوظة: بترجع للقايمة القديمة (سلاسل من بيانات الكتب)', async ({ page }) => {
  await stubMenu(page, []);
  await page.route('**/rest/v1/book_series*', (route) =>
    route.request().method() !== 'GET' ? route.fallback() : route.fulfill({
      json: [{ id: 'old-1', name: 'سلسلة قديمة', description: null, cover_url: null, sort_order: 0, product_series: [{ product_id: 'b4' }] }],
    }));
  await page.goto('/contact');
  await expect(page.locator('.nav-dropdown', { hasText: 'سلسلة قديمة' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.nav-flyout__item')).toHaveCount(0);
});

test('بيانات المتجر الحقيقية: كل القوايم المتداخلة جوه الشاشة ومفيش سكرول أفقي', async ({ page }) => {
  // the real saved menu: let this test read it
  await page.route('**/rest/v1/menu_items*', (route) => route.continue());
  for (const width of [1280, 1440, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.nav-flyout__item').first()).toBeAttached({ timeout: 25_000 });
    await page.waitForTimeout(1200);
    const edges = await page.evaluate(() => {
      const rects = Array.from(document.querySelectorAll('.nav-flyout__panel, .nav-dropdown__submenu, .nav-dropdown__menu')).map((el) => el.getBoundingClientRect());
      return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)), width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
    });
    expect(edges.left, `${width}px: a menu starts left of the screen`).toBeGreaterThanOrEqual(-1);
    expect(edges.right, `${width}px: a menu ends right of the screen`).toBeLessThanOrEqual(edges.width + 1);
    expect(edges.scroll, `${width}px: the page scrolls sideways`).toBeLessThanOrEqual(edges.width + 1);
  }
});
