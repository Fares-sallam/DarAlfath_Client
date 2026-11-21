import { test, expect, type Locator, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «السلاسل والتصنيفات»: the tree, the node editor, books, health checks and the old pages' redirects.
// Hermetic: no real sign-in, every Supabase call is answered here from memory and writes are only recorded.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function node(id: string, over: Record<string, unknown> = {}) {
  return {
    id, parent_id: null, type: 'category', name_ar: id, name_en: null, slug: id, description_ar: null, description_en: null,
    image_url: null, icon: null, color: null, is_active: true, featured: false, show_web: true, show_app: true,
    sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
    books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null,
    intro_ar: null, intro_en: null, video_url: null, page_layout: 'auto', strips_limit: 12, show_as_strip: true,
    legacy_table: null, legacy_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}

const NODES = [
  node('سلسلة أ', { id: 's1', type: 'series', slug: 'series-a', sort_web: 0, sort_app: 1, legacy_table: 'book_series', legacy_id: 's1' }),
  node('سلسلة ب', { id: 's2', type: 'series', slug: 'series-b', sort_web: 1, sort_app: 0, legacy_table: 'book_series', legacy_id: 's2' }),
  node('تصنيف 1', { id: 'c1', parent_id: 's1', slug: 'cat-1', sort_web: 3, sort_app: 3, legacy_table: 'categories', legacy_id: 'c1' }),
  node('تصنيف 2', { id: 'c2', parent_id: 's1', slug: 'cat-2', sort_web: 4, sort_app: 4, legacy_table: 'categories', legacy_id: 'c2' }),
  node('تصنيف فاضي', { id: 'c3', slug: 'cat-3', sort_web: 5, sort_app: 5, legacy_table: 'categories', legacy_id: 'c3', is_active: false }),
].map((n) => ({ ...n, name_ar: ({ s1: 'سلسلة أ', s2: 'سلسلة ب', c1: 'تصنيف 1', c2: 'تصنيف 2', c3: 'تصنيف فاضي' } as Record<string, string>)[n.id as string] }));

const COUNTS = [
  { node_id: 's1', books_direct: 1, books_total: 2 },
  { node_id: 's2', books_direct: 0, books_total: 0 },
  { node_id: 'c1', books_direct: 1, books_total: 1 },
  { node_id: 'c2', books_direct: 0, books_total: 0 },
  { node_id: 'c3', books_direct: 0, books_total: 0 },
];

const PRODUCTS = [
  { id: 'p1', title: 'كتاب مصنّف', author: 'مؤلف 1', cover_url: null, is_active: true, type: 'ورقي' },
  { id: 'p2', title: 'كتاب بلا تصنيف', author: 'مؤلف 2', cover_url: null, is_active: true, type: 'ورقي' },
];
const LINKS = [
  { product_id: 'p1', node_id: 'c1', is_primary: true, sort_order: 0, pinned: false },
  { product_id: 'p1', node_id: 's1', is_primary: false, sort_order: 0, pinned: false },
];

function menu(id: string, over: Record<string, unknown> = {}) {
  return {
    id, channel: 'web', parent_id: null, kind: 'group', node_id: null, label_ar: id, label_en: null, url: null,
    sort_order: 0, visible: true, auto_children: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}
const MENU = [
  menu('m1', { kind: 'home', label_ar: null, sort_order: 0 }),
  menu('m2', { kind: 'node', node_id: 's1', label_ar: null, sort_order: 1, auto_children: true }),
  menu('m3', { kind: 'contact', label_ar: null, sort_order: 2 }),
];
const LAYOUT = [
  { channel: 'web', section_key: 'departments', kind: 'departments', visible: true, sort_order: 0, item_limit: null },
  { channel: 'web', section_key: 'new-arrivals', kind: 'new-arrivals', visible: false, sort_order: 1, item_limit: null },
  { channel: 'web', section_key: 'categories', kind: 'categories', visible: true, sort_order: 2, item_limit: 3 },
  { channel: 'app', section_key: 'best-sellers', kind: 'best-sellers', visible: true, sort_order: 0, item_limit: null },
];

interface Write { method: string; url: string; body: any }
interface Rpc { name: string; body: any }

async function setUp(page: Page, menuRows: Record<string, unknown>[] = MENU) {
  const writes: Write[] = [];
  const rpcs: Rpc[] = [];
  await signInAsFakeOwner(page);

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const get = req.method() === 'GET' || req.method() === 'HEAD';

    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) {
      if (rpc[1] === 'catalog_node_counts') return json(route, COUNTS);
      rpcs.push({ name: rpc[1], body: req.postDataJSON() });
      return route.fulfill({ status: 204, body: '' });
    }

    if (url.includes('/rest/v1/catalog_nodes')) {
      if (get) return json(route, NODES);
      const body = req.method() === 'DELETE' ? null : req.postDataJSON();
      writes.push({ method: req.method(), url, body });
      if (req.method() === 'POST') return json(route, { ...node('new'), ...body, id: 'new-id' }, 201);
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.includes('/rest/v1/product_nodes')) {
      if (get) {
        if (url.includes('products%28') || url.includes('products(')) {
          // سلسلة أ holds two books, تصنيف 1 one, everything else none
          if (url.includes('node_id=eq.s1')) {
            return json(route, [
              { product_id: 'p1', is_primary: false, sort_order: 0, products: PRODUCTS[0] },
              { product_id: 'p2', is_primary: false, sort_order: 1, products: PRODUCTS[1] },
            ]);
          }
          return json(route, url.includes('node_id=eq.c1') ? [{ product_id: 'p1', is_primary: true, sort_order: 0, products: PRODUCTS[0] }] : []);
        }
        return json(route, LINKS);
      }
      writes.push({ method: req.method(), url, body: req.method() === 'DELETE' ? null : req.postDataJSON() });
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.includes('/rest/v1/menu_items')) {
      if (get) return json(route, menuRows);
      writes.push({ method: req.method(), url, body: req.method() === 'DELETE' ? null : req.postDataJSON() });
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.includes('/rest/v1/home_layout') && get) return json(route, LAYOUT);
    if (url.includes('/rest/v1/products') && get) return json(route, PRODUCTS);
    return route.fallback();
  });
  return { writes, rpcs };
}

/** Drag a row's grip onto another row: above it (before), below it (after) or in its middle (inside). */
async function dragOnto(handle: Locator, row: Locator, zone: 'before' | 'after' | 'inside') {
  const box = (await row.boundingBox())!;
  const y = zone === 'before' ? box.height * 0.1 : zone === 'after' ? box.height * 0.9 : box.height * 0.5;
  await handle.dragTo(row, { targetPosition: { x: box.width / 2, y } });
}

const names = (page: Page) => page.getByTestId('tree-row').locator('p.font-bold');

test('الشجرة: الجذور ظاهرة، والأبناء بيظهروا لما تفتح الأب، والبحث بيفتح الطريق', async ({ page }) => {
  await setUp(page);
  await page.goto('/catalog');

  await expect(names(page)).toHaveText(['سلسلة أ', 'سلسلة ب', 'تصنيف فاضي']);
  await page.getByRole('button', { name: 'فتح', exact: true }).first().click();
  await expect(names(page)).toHaveText(['سلسلة أ', 'تصنيف 1', 'تصنيف 2', 'سلسلة ب', 'تصنيف فاضي']);
  await expect(page.locator('[data-node-id="c1"]')).toHaveAttribute('data-depth', '1');

  await page.getByRole('button', { name: 'طي الكل' }).click();
  await page.getByTestId('tree-search').fill('تصنيف 2');
  await expect(names(page)).toHaveText(['سلسلة أ', 'تصنيف 2']);
  await page.getByTestId('tree-search').fill('مش موجود');
  await expect(page.getByText('مفيش نتايج للبحث.')).toBeVisible();
});

test('الشجرة: القناة بتغيّر الترتيب المعروض، والأعداد بتبان', async ({ page }) => {
  await setUp(page);
  await page.goto('/catalog');

  await page.getByTestId('channel-app').click();
  await expect(names(page)).toHaveText(['سلسلة ب', 'سلسلة أ', 'تصنيف فاضي']);
  await page.getByTestId('channel-web').click();
  await expect(names(page)).toHaveText(['سلسلة أ', 'سلسلة ب', 'تصنيف فاضي']);
  await expect(page.locator('[data-node-id="s1"]').getByTestId('row-count')).toHaveText('1 / 2 كتاب');
  await expect(page.locator('[data-node-id="c3"]')).toContainText('مخفي');
});

test('الترتيب: السحب بيرتّب القناة المختارة بس', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await page.goto('/catalog');

  await page.getByTestId('channel-app').click();
  // the app's order is سلسلة ب، سلسلة أ، تصنيف فاضي: drop the first one below the second
  await dragOnto(page.getByRole('button', { name: 'اسحب سلسلة ب للترتيب' }), page.locator('[data-node-id="s1"]'), 'after');
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({ name: 'catalog_reorder_nodes', body: { p_ids: ['s1', 's2', 'c3'], p_channel: 'app' } });
});

test('الترتيب: «الاتنين» بيرتّب الموقع والتطبيق معًا', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await page.goto('/catalog');

  await dragOnto(page.getByRole('button', { name: 'اسحب سلسلة أ للترتيب' }), page.locator('[data-node-id="s2"]'), 'after');
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0].body).toEqual({ p_ids: ['s2', 's1', 'c3'], p_channel: 'both' });
});

test('السحب جوه عنصر: بيتحط تحته ويتحفظ ترتيبه، والعنصر مينفعش يتحط جوه أبنائه', async ({ page }) => {
  const { writes, rpcs } = await setUp(page);
  await page.goto('/catalog');

  // تصنيف فاضي goes inside سلسلة ب (its middle)
  await dragOnto(page.getByRole('button', { name: 'اسحب تصنيف فاضي للترتيب' }), page.locator('[data-node-id="s2"]'), 'inside');
  await expect.poll(() => rpcs.length).toBe(1);
  expect(writes).toHaveLength(1);
  expect(writes[0].method).toBe('PATCH');
  expect(writes[0].body).toEqual({ parent_id: 's2' });
  expect(writes[0].url).toContain('id=eq.c3');
  expect(rpcs[0]).toEqual({ name: 'catalog_reorder_nodes', body: { p_ids: ['c3'], p_channel: 'both' } });
});

test('السحب: عنصر مينفعش يتحط جوه نفسه أو أبنائه', async ({ page }) => {
  const { writes, rpcs } = await setUp(page);
  await page.goto('/catalog');
  await page.getByRole('button', { name: 'فتح الكل' }).click();

  await dragOnto(page.getByRole('button', { name: 'اسحب سلسلة أ للترتيب' }), page.locator('[data-node-id="c1"]'), 'inside');
  await dragOnto(page.getByRole('button', { name: 'اسحب سلسلة أ للترتيب' }), page.locator('[data-node-id="c2"]'), 'after');
  expect(writes).toHaveLength(0);
  expect(rpcs).toHaveLength(0);
});

test('الترتيب بالكيبورد: المقبض + السهم لأسفل', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await page.goto('/catalog');

  await page.getByRole('button', { name: 'اسحب سلسلة أ للترتيب' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0].body).toEqual({ p_ids: ['s2', 's1', 'c3'], p_channel: 'both' });
});

test('الإخفاء السريع: بيبعت is_active بس', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/catalog');

  await page.getByRole('button', { name: 'إخفاء سلسلة أ' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('PATCH');
  expect(writes[0].body).toEqual({ is_active: false });
  expect(writes[0].url).toContain('id=eq.s1');
});

test('إضافة سلسلة: الـslug بيتولّد من الاسم والترتيب بيجي آخر القايمة', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/catalog');

  await page.getByTestId('add-root').click();
  await expect(page.getByTestId('node-editor')).toBeVisible();
  await page.getByTestId('field-name-ar').fill('سلسلة جديدة تمام');
  await expect(page.getByTestId('field-slug')).toHaveValue('سلسلة-جديدة-تمام');
  await page.getByTestId('save-node').click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('POST');
  expect(writes[0].body).toMatchObject({ type: 'series', name_ar: 'سلسلة جديدة تمام', parent_id: null, sort_web: 2, sort_app: 2, is_active: true });
});

test('إضافة تصنيف تحت سلسلة: الأب والنوع جاهزين وبيظهر في الشريط', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/catalog');

  await page.getByRole('button', { name: 'إضافة تحت سلسلة أ' }).click();
  await expect(page.getByTestId('field-type')).toHaveValue('category');
  await expect(page.getByTestId('field-parent')).toHaveValue('s1');
  await page.getByTestId('field-name-ar').fill('تصنيف جديد');
  await page.getByTestId('save-node').click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toMatchObject({ type: 'category', parent_id: 's1', show_in_bar_web: true, show_in_bar_app: true, sort_web: 6, sort_app: 6 });
});

test('التعديل: بيبعت الحقول اللي اتغيّرت بس، والاسم الإنجليزي بيتحفظ', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/catalog');

  await page.getByRole('button', { name: 'تعديل سلسلة ب' }).click();
  await page.getByTestId('field-name-en').fill('Series B');
  await page.getByTestId('save-node').click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('PATCH');
  expect(writes[0].body).toEqual({ name_en: 'Series B' });
});

test('الأب: القايمة بتمنع النقل تحت النفس أو الأبناء', async ({ page }) => {
  await setUp(page);
  await page.goto('/catalog');

  await page.getByRole('button', { name: 'تعديل سلسلة أ' }).click();
  const options = await page.getByTestId('field-parent').locator('option').allTextContents();
  expect(options.some((t) => t.includes('سلسلة أ'))).toBe(false);
  expect(options.some((t) => t.includes('تصنيف 1'))).toBe(false);
  expect(options.some((t) => t.includes('سلسلة ب'))).toBe(true);
});

test('الحذف: عنصر فيه كتب أو أبناء بيتمنع برسالة، والفاضي بيتحذف بعد التأكيد', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/catalog');

  await page.getByRole('button', { name: 'تعديل سلسلة أ' }).click();
  await page.getByTestId('delete-node').click();
  await expect(page.getByText(/فيه 1 كتاب و2 عنصر تحته/)).toBeVisible();
  expect(writes.length).toBe(0);
  await page.getByRole('button', { name: 'إغلاق' }).click();

  await page.getByRole('button', { name: 'تعديل تصنيف فاضي' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('delete-node').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('DELETE');
  expect(writes[0].url).toContain('id=eq.c3');
});

test('كتب العنصر: بتظهر، والإزالة بتحذف الربط', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/catalog');

  await page.getByRole('button', { name: 'فتح الكل' }).click();
  await page.getByRole('button', { name: 'تعديل تصنيف 1' }).click();
  await expect(page.getByTestId('node-editor')).toBeVisible();
  await page.getByTestId('node-editor').getByRole('tab', { name: 'الكتب' }).click();
  await expect(page.getByTestId('node-book-row')).toHaveCount(1);
  await expect(page.getByTestId('node-book-row')).toContainText('كتاب مصنّف');
  await page.getByTitle('إزالة من العنصر').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('DELETE');
  expect(writes[0].url).toContain('node_id=eq.c1');
  expect(writes[0].url).toContain('product_id=eq.p1');
});

test('إضافة كتاب لتصنيف: بتمر على نفس دالة الحفظ وبتحافظ على باقي روابطه', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await page.goto('/catalog');

  await page.getByRole('button', { name: 'فتح الكل' }).click();
  await page.getByRole('button', { name: 'تعديل تصنيف 2' }).click();
  await page.getByTestId('node-editor').getByRole('tab', { name: 'الكتب' }).click();
  await page.getByTestId('add-book-option').filter({ hasText: 'كتاب مصنّف' }).click();
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({
    name: 'catalog_assign_product',
    body: { p_product: 'p1', p_series: ['s1'], p_primary: 'c1', p_extras: ['c2'] },
  });
});

test('تاب الكتب: الفلتر بيجيب الكتب بلا تصنيف، والتعديل بيبعت التنظيم', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await page.goto('/catalog?tab=books');

  await expect(page.getByTestId('book-row')).toHaveCount(2);
  await page.getByTestId('filter-no-category').click();
  await expect(page.getByTestId('book-row')).toHaveCount(1);
  await expect(page.getByTestId('book-row')).toContainText('كتاب بلا تصنيف');

  await page.getByTestId('edit-book').click();
  await page.getByTestId('book-primary').selectOption('c2');
  await page.getByRole('checkbox', { name: 'سلسلة ب' }).check();
  await page.getByTestId('save-book').click();
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({ name: 'catalog_assign_product', body: { p_product: 'p2', p_series: ['s2'], p_primary: 'c2', p_extras: [] } });
});

test('فحص وتنظيف: بيعرض الملاحظات وبيفتح العنصر', async ({ page }) => {
  await setUp(page);
  await page.goto('/catalog?tab=health');

  await expect(page.getByTestId('issue-empty-nodes')).toBeVisible();
  await expect(page.getByTestId('issue-no-primary-category')).toContainText('كتاب بلا تصنيف');
  await expect(page.getByTestId('issue-hidden-with-books')).toHaveCount(0);

  await page.getByTestId('issue-empty-nodes').getByRole('button', { name: 'تصنيف فاضي' }).click();
  await expect(page.getByTestId('node-editor')).toBeVisible();
  await expect(page.getByTestId('field-name-ar')).toHaveValue('تصنيف فاضي');
});

test('الصفحات القديمة: /series و«شريط التصنيفات» في الإعلانات بيروحوا للصفحة الجديدة، والتصنيفات في الإعدادات انتقلت', async ({ page }) => {
  await setUp(page);

  await page.goto('/series');
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByTestId('catalog-page')).toBeVisible();

  await page.goto('/ads-strips?tab=categories');
  await expect(page).toHaveURL(/\/catalog\?tab=menus/);
  await expect(page.getByTestId('tab-menus')).toHaveAttribute('aria-selected', 'true');

  await page.goto('/ads-strips?tab=menu');
  await expect(page).toHaveURL(/\/catalog\?tab=map/);
  await expect(page.getByTestId('display-map')).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: /تصنيفات الكتب/ }).first().click();
  await expect(page.getByTestId('categories-moved')).toBeVisible();
});

test('القايمة الجانبية: «السلاسل والتصنيفات» بقفلها، والمالك مفتوح', async ({ page }) => {
  await setUp(page);
  await page.goto('/');
  await expect(page.getByTestId('nav-lock-catalog')).toHaveAttribute('data-locked', 'false');
  await expect(page.getByRole('link', { name: /السلاسل والتصنيفات/ }).first()).toBeVisible();
});

test('ترتيب كتب السلسلة: السحب بيبعت الترتيب الجديد كله', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await page.goto('/catalog');

  await page.getByRole('button', { name: 'تعديل سلسلة أ' }).click();
  await page.getByTestId('node-editor').getByRole('tab', { name: 'الكتب' }).click();
  await expect(page.getByTestId('node-book-row')).toHaveText([/كتاب مصنّف/, /كتاب بلا تصنيف/]);
  const rows = page.getByTestId('node-book-row');
  await dragOnto(rows.nth(1).getByTestId('drag-handle'), rows.nth(0), 'before');
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({ name: 'catalog_reorder_node_books', body: { p_node: 's1', p_product_ids: ['p2', 'p1'] } });
});

test('خريطة العرض: القايمة بتتعرض رئيسي وفرعي، وكل فرعي مكتوب جوه إيه', async ({ page }) => {
  await setUp(page);
  await page.goto('/catalog?tab=map');

  await expect(page.getByTestId('preview-main')).toHaveText(['الرئيسية', 'سلسلة أ', 'تواصل معنا']);
  await expect(page.getByTestId('preview-main').nth(1).getByLabel('فيه فروع')).toBeVisible();
  await expect(page.getByTestId('preview-main').nth(0).getByLabel('فيه فروع')).toHaveCount(0);

  await expect(page.getByTestId('menu-main')).toHaveCount(3);
  const subs = page.getByTestId('menu-main').nth(1).getByTestId('menu-sub');
  await expect(subs).toHaveCount(2);
  await expect(subs.nth(0)).toContainText('تصنيف 1');
  await expect(subs.nth(0).getByTestId('sub-placement')).toHaveText('فرعي داخل: سلسلة أ');
  await expect(subs.nth(0)).toHaveAttribute('data-auto', 'true');
  await expect(page.getByTestId('menu-main').nth(1)).toContainText('فيه 2 فرع (2 تلقائي)');
});

test('خريطة العرض: السحب بيرتّب الرئيسيين', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await page.goto('/catalog?tab=map');

  const rows = page.getByTestId('menu-main-row');
  await dragOnto(rows.nth(0).getByTestId('drag-handle'), rows.nth(1), 'after');
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({ name: 'menu_reorder', body: { p_ids: ['m2', 'm1', 'm3'] } });
});

test('خريطة العرض: سحب فرعي جوه رئيسي تاني، أو بجنب رئيسي عشان يبقى رئيسي', async ({ page }) => {
  const { rpcs } = await setUp(page, [...MENU, menu('m4', { kind: 'link', label_ar: 'رابط يدوي', url: '/x', parent_id: 'm2', sort_order: 0 })]);
  await page.setViewportSize({ width: 1400, height: 1500 }); // everything on screen: a drag does not scroll in the test browser
  await page.goto('/catalog?tab=map');

  const sub = page.getByTestId('menu-main').nth(1).getByTestId('menu-sub').first();
  const mains = page.getByTestId('menu-main-row');
  await expect(sub).toContainText('رابط يدوي');

  // into «تواصل معنا» (its middle)
  await dragOnto(sub.getByTestId('drag-handle'), mains.nth(2), 'inside');
  await expect.poll(() => rpcs.length).toBe(2);
  expect(rpcs[0]).toEqual({ name: 'menu_move_item', body: { p_id: 'm4', p_parent: 'm3' } });
  expect(rpcs[1]).toEqual({ name: 'menu_reorder', body: { p_ids: ['m4'] } });

  // beside «سلسلة أ» (below it): becomes a main item between it and «تواصل معنا»
  await dragOnto(sub.getByTestId('drag-handle'), mains.nth(1), 'after');
  await expect.poll(() => rpcs.length).toBe(4);
  expect(rpcs[2]).toEqual({ name: 'menu_move_item', body: { p_id: 'm4', p_parent: null } });
  expect(rpcs[3]).toEqual({ name: 'menu_reorder', body: { p_ids: ['m1', 'm2', 'm4', 'm3'] } });
});

test('خريطة العرض: رئيسي جواه فروع مينفعش يتحط جوه رئيسي تاني', async ({ page }) => {
  const { rpcs } = await setUp(page, [...MENU, menu('m4', { kind: 'link', label_ar: 'رابط يدوي', url: '/x', parent_id: 'm2', sort_order: 0 })]);
  await page.setViewportSize({ width: 1400, height: 1500 });
  await page.goto('/catalog?tab=map');

  const mains = page.getByTestId('menu-main-row');
  await dragOnto(mains.nth(1).getByTestId('drag-handle'), mains.nth(2), 'inside');
  expect(rpcs).toHaveLength(0);
});

test('خريطة العرض: إخفاء فرع تلقائي بيحفظ صف مخفي لنفس الابن جوه نفس الرئيسي', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/catalog?tab=map');

  await page.getByRole('button', { name: 'إخفاء تصنيف 1' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('POST');
  expect(writes[0].body).toMatchObject({ kind: 'node', node_id: 'c1', parent_id: 'm2', visible: false, sort_order: 0 });
});

test('خريطة العرض: تثبيت الفروع التلقائية', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await page.goto('/catalog?tab=map');

  await page.getByRole('button', { name: 'تثبيت فروع سلسلة أ' }).click();
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({ name: 'menu_materialize_children', body: { p_id: 'm2' } });
});

test('خريطة العرض: إضافة فرع (رابط) جوه رئيسي معيّن، والرابط الغلط بيتمنع', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/catalog?tab=map');

  await page.getByRole('button', { name: 'إضافة فرع داخل سلسلة أ' }).click();
  await expect(page.getByTestId('menu-parent')).toHaveValue('m2');
  await page.getByTestId('menu-kind').selectOption('link');
  await page.getByTestId('menu-label-ar').fill('عروض خاصة');
  await page.getByTestId('menu-url').fill('javascript:alert(1)');
  await page.getByTestId('menu-save').click();
  await expect(page.getByText(/الرابط لازم يبدأ بـ/)).toBeVisible();
  expect(writes.length).toBe(0);

  await page.getByTestId('menu-url').fill('/books?sale=1');
  await page.getByTestId('menu-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toMatchObject({ kind: 'link', label_ar: 'عروض خاصة', url: '/books?sale=1', parent_id: 'm2', visible: true, sort_order: 0 });
});

test('خريطة العرض: نقل فرعي لرئيسي تاني أو لمستوى رئيسي', async ({ page }) => {
  const { rpcs } = await setUp(page, [...MENU, menu('m4', { kind: 'link', label_ar: 'رابط يدوي', url: '/x', parent_id: 'm2', sort_order: 0 })]);
  await page.goto('/catalog?tab=map');

  const row = page.getByTestId('menu-main').nth(1).getByTestId('menu-sub').first();
  await expect(row).toContainText('رابط يدوي');
  const options = await row.getByTestId('sub-move').locator('option').allTextContents();
  expect(options).toEqual(['اجعله رئيسي', 'داخل: الرئيسية', 'داخل: سلسلة أ', 'داخل: تواصل معنا']);
  await row.getByTestId('sub-move').selectOption('');
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({ name: 'menu_move_item', body: { p_id: 'm4', p_parent: null } });
});

test('خريطة العرض: التطبيق للقراءة، وأقسام الرئيسية بترتيبها', async ({ page }) => {
  await setUp(page);
  await page.goto('/catalog?tab=map');

  await expect(page.getByTestId('map-sections').locator('li')).toHaveText([/كروت «أقسام المتجر»/, /وصل حديثًا/, /رفوف التصنيفات/]);
  await expect(page.getByTestId('map-sections').locator('li').nth(1)).toContainText('مخفي');
  await expect(page.getByTestId('map-bar')).toContainText('تصنيف 1');

  await page.getByTestId('map-channel-app').click();
  await expect(page.getByTestId('app-note')).toContainText('التطبيق مفيهوش قايمة علوية');
  await expect(page.getByTestId('menu-list')).toHaveCount(0);
  await expect(page.getByTestId('map-sections').locator('li')).toHaveText([/الأكثر مبيعًا/]);
});

test('صفحة العرض للسلسلة: الكلمة التعريفية والفيديو والأشرطة', async ({ page }) => {
  const { writes, rpcs } = await setUp(page);
  await page.goto('/catalog');

  await page.getByRole('button', { name: 'تعديل سلسلة أ' }).click();
  await page.getByTestId('node-editor').getByRole('tab', { name: 'صفحة العرض' }).click();

  const strips = page.getByTestId('strip-row');
  await expect(strips).toHaveText([/تصنيف 1/, /تصنيف 2/]);
  await dragOnto(strips.nth(0).getByTestId('drag-handle'), strips.nth(1), 'after');
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({ name: 'catalog_reorder_nodes', body: { p_ids: ['c2', 'c1'], p_channel: 'web' } });

  await page.getByRole('button', { name: 'إخفاء شريط تصنيف 2' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toEqual({ show_as_strip: false });
  expect(writes[0].url).toContain('id=eq.c2');

  await page.getByTestId('field-intro-ar').fill('منهج متكامل لتعليم الأطفال');
  await page.getByTestId('field-video').fill('http://not-secure.example/video');
  await page.getByTestId('field-layout').selectOption('strips');
  await page.getByTestId('save-node').click();
  await expect(page.getByText('رابط الفيديو لازم يبدأ بـ https://')).toBeVisible();
  expect(writes.length).toBe(1);

  await page.getByTestId('field-video').fill('https://www.youtube.com/watch?v=abc');
  await page.getByTestId('field-strips-limit').fill('8');
  await page.getByTestId('save-node').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body).toEqual({ intro_ar: 'منهج متكامل لتعليم الأطفال', video_url: 'https://www.youtube.com/watch?v=abc', page_layout: 'strips', strips_limit: 8 });
});
