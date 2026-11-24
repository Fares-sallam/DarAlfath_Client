import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// A move made in «السلاسل والتصنيفات» shows up in «إدارة الكتب» straight away (no reload, no waiting for the list's cache to
// expire), and the list says which place is the book's primary category and which are extra.
// Hermetic: no real sign-in; the database is a small in-memory state that the assign call changes, like the real mirror does.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const node = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, parent_id: null, type: 'category', name_ar: name, name_en: null, slug: id, description_ar: null, description_en: null, image_url: null, icon: null, color: null,
  is_active: true, featured: false, show_web: true, show_app: true, sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true,
  hide_when_empty: true, books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null, intro_ar: null,
  intro_en: null, video_url: null, intro_media: 'auto', intro_image_url: null, intro_align: 'right', intro_font_px: 16, intro_pad_right: 0, intro_pad_left: 0,
  intro_text_pos: 'side', page_layout: 'auto', strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
});
const NODES = [node('cat-1', 'النحو'), node('cat-2', 'القصص')];
const NAMES: Record<string, string> = { 'cat-1': 'النحو', 'cat-2': 'القصص' };
const CATEGORIES = [
  { id: 'cat-1', name: 'النحو', slug: 'nahw', description: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-2', name: 'القصص', slug: 'qisas', description: null, created_at: '2026-01-01T00:00:00Z' },
];

async function setUp(page: Page) {
  // the "database": the book's primary category and its extra categories
  const db = { primary: 'cat-1', extras: [] as string[] };
  const requests = { products: 0, assigned: 0, productsAfterAssign: 0 };

  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const get = req.method() === 'GET' || req.method() === 'HEAD';

    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) {
      if (rpc[1] === 'catalog_assign_product') {
        const body = req.postDataJSON() as { p_primary: string | null; p_extras: string[] };
        db.primary = body.p_primary ?? '';
        db.extras = body.p_extras;
        requests.assigned += 1;
        return route.fulfill({ status: 204, body: '' });
      }
      if (rpc[1] === 'catalog_node_counts') return json(route, []);
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.includes('/rest/v1/catalog_nodes') && get) return json(route, NODES);
    if (url.includes('/rest/v1/product_nodes') && get) {
      return json(route, [
        ...(db.primary ? [{ product_id: 'p1', node_id: db.primary, is_primary: true, sort_order: 0, pinned: false }] : []),
        ...db.extras.map((id) => ({ product_id: 'p1', node_id: id, is_primary: false, sort_order: 0, pinned: false })),
      ]);
    }
    if (url.includes('/rest/v1/categories') && get) return json(route, CATEGORIES);
    if (url.includes('/rest/v1/products') && get) {
      // the books list asks for the whole product; the catalog's books tab only for a few columns
      if (!url.includes('product_variants')) {
        return json(route, [{ id: 'p1', title: 'قواعد النحو', author: 'مؤلف', cover_url: null, is_active: true, type: 'ورقي' }]);
      }
      requests.products += 1;
      if (requests.assigned > 0) requests.productsAfterAssign += 1;
      return json(route, [{
        id: 'p1', title: 'قواعد النحو', author: 'مؤلف', publisher: null, page_count: null, publication_year: null, description: 'وصف', cover_url: null,
        category_id: db.primary || null, isbn: null, keywords: [], type: 'ورقي', cost_price: 20, base_price: 50, sale_price: null, profit: 30, is_active: true,
        is_bundle: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        categories: db.primary ? { id: db.primary, name: NAMES[db.primary], slug: db.primary } : null,
        electronic_books: null, product_series: [],
        product_categories: db.extras.map((id) => ({ category_id: id, categories: { id, name: NAMES[id], slug: id } })),
        bundle_items: [], product_variants: [],
      }]);
    }
    if (get) return json(route, []);
    return route.fallback();
  });
  return { db, requests };
}

test('نقل كتاب من «السلاسل والتصنيفات» بيبان في «إدارة الكتب» فورًا من غير ريفريش، والأساسي متميّز عن الإضافي', async ({ page }) => {
  const { requests } = await setUp(page);
  await page.goto('/books');

  const places = page.getByTestId('book-places');
  await expect(places).toHaveCount(1, { timeout: 20_000 });
  await expect(places.getByTestId('chip-primary')).toContainText('النحو');
  await expect(places.getByTestId('chip-extra')).toHaveCount(0);
  await expect(page.getByTestId('books-places-legend')).toContainText('الأساسي هو مكان الكتاب الأصلي');
  // the page is never reloaded from here on
  await page.evaluate(() => { (window as unknown as { __kept: boolean }).__kept = true; });

  await page.getByRole('link', { name: 'السلاسل والتصنيفات' }).click();
  await expect(page).toHaveURL(/\/catalog/);
  await page.getByTestId('tab-books').click();
  await page.getByTestId('edit-book').click();
  await page.getByTestId('book-primary').selectOption('cat-2');
  await page.getByRole('checkbox', { name: 'النحو' }).check();
  await page.getByTestId('save-book').click();
  await expect.poll(() => requests.assigned).toBe(1);

  await page.getByRole('link', { name: 'إدارة الكتب' }).click();
  await expect(page).toHaveURL(/\/books/);
  const moved = page.getByTestId('book-places');
  await expect(moved.getByTestId('chip-primary')).toContainText('القصص');
  await expect(moved.getByTestId('chip-extra')).toContainText('النحو');
  await expect(moved.getByTestId('chip-primary')).toHaveCount(1);
  // the list was fetched again after the move, not served from its cache
  expect(requests.productsAfterAssign).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
});
