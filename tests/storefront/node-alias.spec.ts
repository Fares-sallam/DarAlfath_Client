import { test, expect, type Page } from '../fixtures';

// An old link to a catalog item that was merged into another one (the dashboard's «دمج») opens the item it became: the old category
// slug, the old series id and the old node id are all sent on. Addresses that are alive, or that no merge knows, are left alone.
// Answered by the test; nothing is written.

const NOW = '2026-01-01T00:00:00Z';
const SER = '11111111-1111-4111-8111-111111111111';
const SER_OLD = '22222222-2222-4222-8222-222222222222';
const CAT = '33333333-3333-4333-8333-333333333333';
const CAT_OLD = '44444444-4444-4444-8444-444444444444';
const node = (over: Record<string, unknown>) => ({
  id: SER, parent_id: null, type: 'series', name_ar: 'سلسلة', name_en: null, slug: 'ser', description_ar: null, description_en: null, image_url: null, icon: null, color: null,
  is_active: true, featured: false, show_web: true, show_app: true, sort_web: 0, sort_app: 0, show_in_menu_web: true, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
  books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null, intro_ar: null, intro_en: null, video_url: null,
  intro_media: 'auto', intro_image_url: null, intro_align: 'right', intro_font_px: 16, intro_pad_right: 0, intro_pad_left: 0, intro_text_pos: 'side',
  page_layout: 'grid', strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null, created_at: NOW, updated_at: NOW, ...over,
});

async function stub(page: Page) {
  const nodes = [node({}), node({ id: CAT, type: 'category', name_ar: 'الكتابة', slug: 'new-cat', parent_id: SER })];
  const aliases = [
    { old_id: CAT_OLD, old_slug: 'old-cat', node_id: CAT },
    { old_id: SER_OLD, old_slug: 'old-ser', node_id: SER },
  ];
  await page.route('**/rest/v1/catalog_nodes*', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: nodes })));
  await page.route('**/rest/v1/catalog_node_aliases*', (route) => route.fulfill({ json: aliases }));
  await page.route('**/rest/v1/product_nodes*', (route) =>
    route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: [{ product_id: 'b1', node_id: CAT, is_primary: true, sort_order: 0 }] }));
  await page.route('**/rest/v1/menu_items*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/store_departments*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: [{ product_id: 'b1', title: 'كتاب', author: 'مؤلف', category_slug: 'new-cat', category_name: 'الكتابة', country_code: 'EG', min_price: 50, max_price: 50, starting_price: 50, images: [] }],
    }));
}

const params = (page: Page) => new URL(page.url()).searchParams;

test('الرابط القديم لتصنيف اتدمج: بيفتح التصنيف اللي فضل (بالرابط المختصر)', async ({ page }) => {
  await stub(page);
  await page.goto('/books?category=old-cat');
  await expect.poll(() => params(page).get('category')).toBe('new-cat');
  await expect(page.getByText('كتاب').first()).toBeVisible({ timeout: 20_000 });
});

test('الرابط القديم لسلسلة اتدمجت: بيفتح السلسلة اللي فضلت، وللتصنيف بـ id قديم بيفتحه بالعقدة', async ({ page }) => {
  await stub(page);
  await page.goto(`/books?series=${SER_OLD}`);
  await expect.poll(() => params(page).get('series')).toBe(SER);

  // an old id that now belongs to a category is no series any more: the category opens as a node
  await page.goto(`/books?series=${CAT_OLD}`);
  await expect.poll(() => params(page).get('node')).toBe(CAT);
  expect(params(page).get('series')).toBeNull();

  await page.goto(`/books?node=${CAT_OLD}`);
  await expect.poll(() => params(page).get('node')).toBe(CAT);
});

test('عنوان حي أو عنوان مفيش دمج يعرفه: بيفضل زي ما هو', async ({ page }) => {
  await stub(page);
  await page.goto('/books?category=new-cat');
  await expect(page.getByText('كتاب').first()).toBeVisible({ timeout: 20_000 });
  expect(params(page).get('category')).toBe('new-cat');

  await page.goto('/books?category=never-existed');
  await page.waitForTimeout(1200);
  expect(params(page).get('category')).toBe('never-existed');
});
