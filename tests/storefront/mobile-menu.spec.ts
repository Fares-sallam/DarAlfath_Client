import { test, expect, type Page } from '../fixtures';

// The phone's menu (the button with three lines): the same entries the dashboard's «خريطة العرض» gives the top menu on a computer,
// opened branch by branch, and re-read from the dashboard every time it is opened. Answered by the test; nothing is written.

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


const PHONE = { width: 390, height: 844 };
const overlay = (page: Page) => page.locator('.mobile-nav-overlay');
const openDrawer = async (page: Page) => {
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  await expect(overlay(page)).toHaveClass(/mobile-nav-overlay--open/);
};
const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
/** the top-level entries of the phone menu */
const topLabels = (page: Page) =>
  page.getByTestId('mobile-menu').evaluate((root) =>
    [...root.children].map((el) => (el.classList.contains('mobile-menu__branch') ? el.querySelector('.mobile-menu__label') : el)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''));

test('الموبايل بيعرض نفس العناصر الرئيسية اللي على الكمبيوتر بنفس الترتيب', async ({ browser }) => {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await stubMenu(desktop);
  await desktop.goto('/contact');
  const bar = desktop.locator('.site-header__nav');
  await expect(bar.locator('.nav-dropdown')).toHaveCount(1, { timeout: 20_000 });
  const onDesktop = await bar.evaluate((el) => [...el.children].map((c) => (c.querySelector('.nav-dropdown__trigger span') ?? c).textContent?.replace(/\s+/g, ' ').trim() ?? ''));
  await desktop.close();

  const phone = await browser.newPage({ viewport: PHONE });
  await stubMenu(phone);
  await phone.goto('/contact');
  await expect(phone.getByTestId('mobile-menu')).toBeAttached({ timeout: 20_000 });
  await openDrawer(phone);
  expect(await topLabels(phone)).toEqual(onDesktop);
  expect(onDesktop).toEqual(['الرئيسية', 'سلسلة الاختبار', 'سلسلة من غير أبناء', 'تواصل معنا']);
  await phone.close();
});

test('الموبايل: الفرع بيتفتح بسهم، فيه المجموعة والتلقائي والخارجي، والمخفي والفاضي مش بيظهروا، وفتح تاني يطويه', async ({ page }) => {
  await stubMenu(page);
  await page.setViewportSize(PHONE);
  await page.goto('/contact');
  await expect(page.getByTestId('mobile-menu')).toBeAttached({ timeout: 20_000 });
  await openDrawer(page);

  const branch = page.getByTestId('mobile-menu-branch').filter({ hasText: 'سلسلة الاختبار' }).first();
  await expect(branch).toHaveAttribute('data-open', 'false');
  await expect(page.getByTestId('mobile-menu').getByText('عرض كل كتب سلسلة الاختبار')).toHaveCount(0);

  await branch.getByTestId('mobile-menu-toggle').first().click();
  await expect(branch).toHaveAttribute('data-open', 'true');
  const menu = page.getByTestId('mobile-menu');
  await expect(menu.getByText('عرض كل كتب سلسلة الاختبار')).toBeVisible();
  await expect(menu.getByRole('button', { name: 'المواد', exact: true })).toBeVisible();
  await expect(menu.getByText('الكتابة', { exact: true })).toBeVisible();
  await expect(menu.getByText('تصنيف فاضي')).toHaveCount(0);
  await expect(menu.getByText('تصنيف مخفي من القايمة')).toHaveCount(0);
  const outside = menu.getByRole('link', { name: 'موقع خارجي' });
  await expect(outside).toHaveAttribute('target', '_blank');
  await expect(outside).toHaveAttribute('href', 'https://example.com/x');

  // a group opens what is inside it, one more level down
  await menu.getByRole('button', { name: 'المواد', exact: true }).click();
  await expect(menu.getByText('الحساب', { exact: true })).toBeVisible();

  // tapping the arrow again closes the branch
  await branch.getByTestId('mobile-menu-toggle').first().click();
  await expect(branch).toHaveAttribute('data-open', 'false');
  await expect(menu.getByText('عرض كل كتب سلسلة الاختبار')).toHaveCount(0);
});

test('الموبايل: الضغط على عنصر بيروح لصفحته وبيقفل القايمة، وصفحة السلسلة الحالية فرعها مفتوح من الأول', async ({ page }) => {
  await stubMenu(page);
  await page.setViewportSize(PHONE);
  await page.goto('/books?series=ser');
  await expect(page.getByTestId('mobile-menu')).toBeAttached({ timeout: 20_000 });
  await openDrawer(page);
  const branch = page.getByTestId('mobile-menu-branch').filter({ hasText: 'سلسلة الاختبار' }).first();
  await expect(branch).toHaveAttribute('data-open', 'true');

  await page.getByTestId('mobile-menu').getByText('عرض كل كتب سلسلة الاختبار').click();
  await expect(overlay(page)).not.toHaveClass(/mobile-nav-overlay--open/);

  await openDrawer(page);
  await page.getByTestId('mobile-menu').getByRole('link', { name: 'تواصل معنا' }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(overlay(page)).not.toHaveClass(/mobile-nav-overlay--open/);
});

test('الموبايل: تحت قايمة الخريطة روابط سريعة (الكتب، التصنيفات، سياستنا) من غير تكرار الموجود فيها', async ({ page }) => {
  await stubMenu(page);
  await page.setViewportSize(PHONE);
  await page.goto('/contact');
  await expect(page.getByTestId('mobile-menu')).toBeAttached({ timeout: 20_000 });
  await openDrawer(page);
  const quick = page.getByTestId('mobile-menu-quick');
  expect((await quick.locator('a').allInnerTexts()).map(clean)).toEqual(['الكتب', 'التصنيفات', 'سياستنا']);
  await expect(page.getByTestId('mobile-menu-fixed')).toHaveCount(0);
});

test('الموبايل: من غير خريطة محفوظة بيرجع للروابط الثابتة زي ما كان', async ({ page }) => {
  await stubMenu(page, []);
  await page.setViewportSize(PHONE);
  await page.goto('/contact');
  await page.waitForTimeout(1500);
  await openDrawer(page);
  const fixed = page.getByTestId('mobile-menu-fixed');
  await expect(fixed).toBeVisible();
  expect((await fixed.locator('a').allInnerTexts()).map(clean)).toEqual(['الرئيسية', 'الكتب', 'سياستنا', 'تواصل معنا', 'التصنيفات']);
  await expect(page.getByTestId('mobile-menu')).toHaveCount(0);
});

test('الموبايل: فتح القايمة بيقرا خريطة العرض تاني، فاللي اتغيّر في اللوحة بيظهر من غير ريفريش', async ({ page }) => {
  let calls = 0;
  await stubMenu(page);
  // the first read is the saved map; every later one is what the dashboard changed since
  await page.route('**/rest/v1/menu_items*', (route) => {
    calls += 1;
    const changed = ITEMS.map((item) => (item.id === 'main-solo' ? { ...item, label_ar: 'سلسلة بعد التعديل' } : item));
    return route.fulfill({ json: calls === 1 ? ITEMS : changed });
  });
  await page.setViewportSize(PHONE);
  await page.goto('/contact');
  await expect(page.getByTestId('mobile-menu')).toBeAttached({ timeout: 20_000 });
  await openDrawer(page);
  await expect.poll(() => topLabels(page)).toContain('سلسلة بعد التعديل');
  expect(calls).toBeGreaterThanOrEqual(2);
});
