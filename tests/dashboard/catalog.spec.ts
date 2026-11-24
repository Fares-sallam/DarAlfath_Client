import { test, expect, type Locator, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';
import { fakeFrames, lastMessage } from '../support/fakeFrames';

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
    intro_ar: null, intro_en: null, video_url: null, intro_media: 'auto', intro_image_url: null, intro_align: 'right', intro_font_px: 16, intro_pad_right: 0, intro_pad_left: 0, intro_text_pos: 'side', page_layout: 'auto', strips_limit: 12, show_as_strip: true,
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

// the cards of «أقسام المتجر» as saved
const DEPARTMENT_ROWS = [{ node_id: 's1', sort_order: 0 }, { node_id: 's2', sort_order: 1 }];

interface Write { method: string; url: string; body: any }
interface Rpc { name: string; body: any }

async function setUp(page: Page, menuRows: Record<string, unknown>[] = MENU, nodeRows: Record<string, unknown>[] = NODES, linkRows: Record<string, unknown>[] = LINKS) {
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
      if (get) return json(route, nodeRows);
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
        return json(route, linkRows);
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
    if (url.includes('/rest/v1/store_departments') && get) return json(route, DEPARTMENT_ROWS);
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
  await expect(page.locator('[data-node-id="s1"]').getByTestId('row-count')).toHaveText('2 كتاب (1 مباشرة)');
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

// قسم ← سلسلة أ ← (تصنيف 1، تصنيف 2)
const SECTIONED = [node('sec', { type: 'section', name_ar: 'قسم الكبار', slug: 'sec' }), { ...NODES[0], parent_id: 'sec' }, ...NODES.slice(1)];

test('الشجرة: العدد مش صفر مضلل: «داخل عناصره» لما الكتب كلها تحت، و«مباشرة» لما فيه بعضها', async ({ page }) => {
  await setUp(page, MENU, SECTIONED);
  await page.goto('/catalog');
  // the section holds no book itself, the series under it holds two (one of them its own)
  await expect(page.locator('[data-node-id="sec"]').getByTestId('row-count')).toHaveText('—');
  await page.getByRole('button', { name: 'فتح', exact: true }).first().click();
  await expect(page.locator('[data-node-id="s1"]').getByTestId('row-count')).toHaveText('2 كتاب (1 مباشرة)');
});

test('الشجرة: فلتر النوع بيعرض نوع واحد مع اللي فوقه، وبيشتغل مع البحث', async ({ page }) => {
  await setUp(page, MENU, SECTIONED);
  await page.goto('/catalog');

  await page.getByTestId('type-series').click();
  await expect(names(page)).toHaveText(['قسم الكبار', 'سلسلة أ', 'سلسلة ب']);
  await page.getByTestId('type-section').click();
  await expect(names(page)).toHaveText(['قسم الكبار']);
  await page.getByTestId('type-category').click();
  await expect(names(page)).toHaveText(['قسم الكبار', 'سلسلة أ', 'تصنيف 1', 'تصنيف 2', 'تصنيف فاضي']);

  await page.getByTestId('type-series').click();
  await page.getByTestId('tree-search').fill('ب');
  await expect(names(page)).toHaveText(['سلسلة ب']);
  await page.getByTestId('type-all').click();
  await page.getByTestId('tree-search').fill('');
  await expect(names(page)).toHaveText(['قسم الكبار', 'سلسلة ب', 'تصنيف فاضي']);
});

test('تاب الكتب: كل كتاب بيظهر القسم ثم التصنيف الأساسي ثم السلسلة، والفلاتر بالقسم والسلسلة والتصنيف', async ({ page }) => {
  await setUp(page, MENU, SECTIONED);
  await page.goto('/catalog?tab=books');

  // the classified book: its section comes from where the series sits in the tree
  const row = page.getByTestId('book-row').filter({ hasText: 'كتاب مصنّف' });
  await expect(row.getByTestId('chip-series')).toBeVisible();
  const kinds = await row.locator('[data-testid^="chip-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(kinds).toEqual(['chip-section', 'chip-primary', 'chip-series']);
  await expect(row.getByTestId('chip-section')).toContainText('قسم الكبار');
  await expect(row.getByTestId('chip-primary')).toContainText('تصنيف 1');
  await expect(row.getByTestId('chip-series')).toContainText('سلسلة أ');
  await expect(page.getByTestId('book-row').filter({ hasText: 'كتاب بلا تصنيف' }).getByTestId('chip-no-primary')).toBeVisible();
  await expect(page.getByTestId('books-legend')).toContainText('تصنيف أساسي');

  await expect(page.getByTestId('books-result-count')).toHaveText('2 كتاب');
  await page.getByTestId('filter-section').selectOption('sec');
  await expect(page.getByTestId('book-row')).toHaveCount(1);
  await expect(page.getByTestId('books-result-count')).toHaveText('1 كتاب');
  await page.getByTestId('filter-series').selectOption('s1');
  await expect(page.getByTestId('book-row')).toHaveCount(1);
  await page.getByTestId('filter-category').selectOption('c2');
  await expect(page.getByTestId('book-row')).toHaveCount(0);
  await expect(page.getByTestId('books-list')).toContainText('مفيش كتب مطابقة');
  await page.getByTestId('filter-category').selectOption('c1');
  await expect(page.getByTestId('book-row')).toHaveCount(1);
  await page.getByTestId('clear-place-filters').click();
  await expect(page.getByTestId('book-row')).toHaveCount(2);
});

test('تعديل تنظيم الكتاب: التصنيف الأساسي لوحده، والإضافية لوحدها، ومكان الكتاب بيتحدّث وانت بتختار', async ({ page }) => {
  await setUp(page, MENU, SECTIONED);
  await page.goto('/catalog?tab=books');

  await page.getByTestId('book-row').filter({ hasText: 'كتاب بلا تصنيف' }).getByTestId('edit-book').click();
  const where = page.getByTestId('book-dialog-where');
  await expect(where).toContainText('بلا تصنيف أساسي');
  await expect(page.getByTestId('primary-block')).toContainText('واحد بس');
  await expect(page.getByTestId('extras-block')).toContainText('كذا واحد');

  await page.getByTestId('book-primary').selectOption('c1');
  await expect(where.getByTestId('chip-primary')).toContainText('تصنيف 1');
  await expect(where.getByTestId('chip-section')).toContainText('قسم الكبار');
  // the primary category is not offered again as an extra
  await expect(page.getByTestId('extras-block').getByRole('checkbox', { name: 'تصنيف 1' })).toHaveCount(0);
  await expect(page.getByTestId('extras-block').getByRole('checkbox', { name: 'تصنيف 2' })).toHaveCount(1);

  await page.getByTestId('extras-block').getByRole('checkbox', { name: 'تصنيف 2' }).check();
  await expect(where.getByTestId('chip-extra')).toContainText('تصنيف 2');
  await page.getByTestId('series-block').getByRole('checkbox', { name: 'سلسلة ب' }).check();
  await expect(where.getByTestId('chip-series')).toContainText('سلسلة ب');
});

test('الشجرة: كل صف عليه علامة الهيدر (من غير شريط معاينة)، و«إضافة للهيدر» بتفتح الإضافة بالعنصر جاهز من غير ما تحفظ حاجة', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/catalog');

  const state = (id: string) => page.locator(`[data-node-id="${id}"]`).getByTestId('header-badge');
  // the menu rows say: home, سلسلة أ (filling its sub-items from the tree), contact
  await expect(state('s1')).toHaveAttribute('data-state', 'in');
  await expect(state('s1')).toHaveText('في الهيدر');
  await expect(state('s2')).toHaveAttribute('data-state', 'none');
  await expect(state('s2')).toHaveText('مش في الهيدر');
  await expect(state('c3')).toHaveAttribute('data-state', 'none');
  // the little preview strip that used to sit above the tree is gone
  await expect(page.getByTestId('header-preview')).toHaveCount(0);

  // a sub-item says what it sits inside; an empty one says why it is not drawn
  await page.getByRole('button', { name: 'فتح', exact: true }).first().click();
  await expect(state('c1')).toHaveAttribute('data-state', 'in');
  await expect(state('c1')).toContainText('في الهيدر ‹ سلسلة أ');
  await expect(state('c2')).toHaveAttribute('data-state', 'empty');

  // «إضافة للهيدر»: the add dialog opens on «من السلاسل والتصنيفات» with the series chosen; nothing is saved by getting there
  await page.locator('[data-node-id="s2"]').getByTestId('header-add').click();
  await expect(page.getByTestId('menu-dialog')).toBeVisible();
  await expect(page.getByTestId('menu-node')).toHaveValue('s2');
  await expect(page).toHaveURL(/tab=map/);
  await expect(page).not.toHaveURL(/add=/);
  expect(writes.filter((w) => w.url.includes('menu_items'))).toEqual([]);
});

test('علامة الهيدر: صف مقفول، وعنصر مخفي عن الموقع، كل واحد بسببه', async ({ page }) => {
  const menuRows = [
    menu('m1', { kind: 'home', label_ar: null, sort_order: 0 }),
    menu('m2', { kind: 'node', node_id: 's1', label_ar: null, sort_order: 1, visible: false }),
    menu('m4', { kind: 'node', node_id: 's2', label_ar: null, sort_order: 2 }),
  ];
  const nodes = NODES.map((n) => (n.id === 's2' ? { ...n, show_web: false } : n));
  await setUp(page, menuRows, nodes);
  await page.goto('/catalog');
  await expect(page.locator('[data-node-id="s1"]').getByTestId('header-badge')).toHaveAttribute('data-state', 'row-hidden');
  await expect(page.locator('[data-node-id="s1"]').getByTestId('header-open-map')).toBeVisible();
  await expect(page.locator('[data-node-id="s2"]').getByTestId('header-badge')).toHaveAttribute('data-state', 'node-hidden');
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
  await expect(page.getByTestId('menu-main').nth(1)).toContainText('فيه 2 (2 تلقائي)');
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
  await page.waitForTimeout(400); // the list redraws after the first move; a second drag must start from the redrawn row
  await dragOnto(sub.getByTestId('drag-handle'), mains.nth(1), 'after');
  await expect.poll(() => rpcs.length).toBe(4);
  expect(rpcs[2]).toEqual({ name: 'menu_move_item', body: { p_id: 'm4', p_parent: null } });
  expect(rpcs[3]).toEqual({ name: 'menu_reorder', body: { p_ids: ['m1', 'm2', 'm4', 'm3'] } });
});

test('خريطة العرض: عنصر جواه فروع ينفع يتحط جوه عنصر تاني (الفروع بتروح معاه)', async ({ page }) => {
  const { rpcs } = await setUp(page, [...MENU, menu('m4', { kind: 'link', label_ar: 'رابط يدوي', url: '/x', parent_id: 'm2', sort_order: 0 })]);
  await page.setViewportSize({ width: 1400, height: 1500 });
  await page.goto('/catalog?tab=map');

  const mains = page.getByTestId('menu-main-row');
  await dragOnto(mains.nth(1).getByTestId('drag-handle'), mains.nth(2), 'inside');
  await expect.poll(() => rpcs.length).toBe(2);
  expect(rpcs[0]).toEqual({ name: 'menu_move_item', body: { p_id: 'm2', p_parent: 'm3' } });
  expect(rpcs[1]).toEqual({ name: 'menu_reorder', body: { p_ids: ['m2'] } });
});

test('خريطة العرض: حد 4 مستويات: مفيش زر فرع تحت المستوى الرابع، والسحب جواه بيترفض', async ({ page }) => {
  const chain = [
    menu('d1', { kind: 'group', label_ar: 'مستوى 1', sort_order: 0 }),
    menu('d2', { kind: 'group', label_ar: 'مستوى 2', parent_id: 'd1' }),
    menu('d3', { kind: 'group', label_ar: 'مستوى 3', parent_id: 'd2' }),
    menu('d4', { kind: 'group', label_ar: 'مستوى 4', parent_id: 'd3' }),
    menu('x', { kind: 'group', label_ar: 'عنصر تاني', sort_order: 1 }),
  ];
  const { rpcs } = await setUp(page, chain);
  await page.setViewportSize({ width: 1400, height: 1800 });
  await page.goto('/catalog?tab=map');

  await expect(page.locator('[data-level="4"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'إضافة فرع داخل مستوى 3' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إضافة فرع داخل مستوى 4' })).toHaveCount(0);
  await expect(page.locator('[data-level="4"]').getByTestId('sub-placement')).toHaveText('فرعي داخل: مستوى 1 ‹ مستوى 2 ‹ مستوى 3');

  await dragOnto(page.locator('[data-id="x"]').getByTestId('drag-handle').first(), page.locator('[data-id="d4"]').getByTestId('menu-sub-row').first(), 'inside');
  expect(rpcs).toHaveLength(0);
});

test('خريطة العرض: تجميع فروع تلقائية في مجموعة اسمها «المواد»', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await page.goto('/catalog?tab=map');

  const subs = page.getByTestId('menu-main').nth(1).getByTestId('menu-sub');
  await subs.nth(0).getByTestId('menu-select').check();
  await subs.nth(1).getByTestId('menu-select').check();
  await expect(page.getByTestId('group-bar')).toContainText('اخترت 2 عنصر داخل «سلسلة أ»');
  await page.getByTestId('group-start').click();
  await page.getByTestId('group-name').fill('المواد');
  await page.getByTestId('group-confirm').click();
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({ name: 'menu_group_items', body: { p_parent: 'm2', p_label_ar: 'المواد', p_item_ids: [], p_node_ids: ['c1', 'c2'] } });
});

test('خريطة العرض: التجميع بيجمع المخزّن والتلقائي مع بعض، والاختيار بيتفرّغ لما تغيّر الأب', async ({ page }) => {
  const rows = [
    ...MENU,
    menu('m4', { kind: 'link', label_ar: 'رابط يدوي', url: '/x', parent_id: 'm2', sort_order: 0 }),
    menu('m5', { kind: 'link', label_ar: 'رابط تاني', url: '/y', parent_id: 'm3', sort_order: 0 }),
  ];
  const { rpcs } = await setUp(page, rows);
  await page.setViewportSize({ width: 1400, height: 1500 });
  await page.goto('/catalog?tab=map');

  const under = (parent: string) => page.locator(`[data-id="${parent}"]`).locator('xpath=./div[@data-testid="menu-sub"]');
  await under('m2').nth(0).getByTestId('menu-select').check(); // رابط يدوي (stored)
  await under('m2').nth(1).getByTestId('menu-select').check(); // تصنيف 1 (automatic)
  await expect(page.getByTestId('group-bar')).toContainText('اخترت 2');
  // a row from another parent starts a new selection
  await under('m3').nth(0).getByTestId('menu-select').check();
  await expect(page.getByTestId('group-bar')).toContainText('اخترت 1 عنصر داخل «تواصل معنا»');
  await under('m3').nth(0).getByTestId('menu-select').uncheck();
  await expect(page.getByTestId('group-bar')).toHaveCount(0);

  await under('m2').nth(0).getByTestId('menu-select').check();
  await under('m2').nth(1).getByTestId('menu-select').check();
  await page.getByTestId('group-start').click();
  await page.getByTestId('group-name').fill('مجموعة');
  await page.getByTestId('group-name').press('Enter');
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0].body).toEqual({ p_parent: 'm2', p_label_ar: 'مجموعة', p_item_ids: ['m4'], p_node_ids: ['c1'] });
});

test('خريطة العرض: مجموعة جواها عنصر: مكتوب جوه إيه بالظبط، وفك المجموعة', async ({ page }) => {
  const rows = [
    ...MENU,
    menu('g', { kind: 'group', label_ar: 'المواد', parent_id: 'm2', sort_order: 0 }),
    menu('n1', { kind: 'node', node_id: 'c1', label_ar: null, parent_id: 'g', sort_order: 0 }),
  ];
  const { rpcs } = await setUp(page, rows);
  await page.goto('/catalog?tab=map');

  const inGroup = page.locator('[data-id="n1"]');
  await expect(inGroup).toHaveAttribute('data-level', '3');
  await expect(inGroup.getByTestId('sub-placement')).toHaveText('فرعي داخل: سلسلة أ ‹ المواد');
  // «تصنيف 1» sits inside the group, so it is not repeated as an automatic child of the series
  await expect(page.getByTestId('menu-main').nth(1).locator('[data-auto="true"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'فك مجموعة المواد' }).click();
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({ name: 'menu_ungroup', body: { p_group: 'g' } });
});

test('رفوف الصفحة الرئيسية: الاسم الصح في الخريطة، وزر الإضافة «إضافة عنصر»', async ({ page }) => {
  await setUp(page);
  await page.goto('/catalog?tab=map');
  await expect(page.getByTestId('shelves-title')).toHaveText('رفوف الصفحة الرئيسية (الموقع)');
  await expect(page.getByTestId('menu-add')).toHaveText('إضافة عنصر');
  await page.getByTestId('map-channel-app').click();
  await expect(page.getByTestId('shelves-title')).toHaveText('رفوف الصفحة الرئيسية (التطبيق)');
});

test('خريطة العرض: إخفاء فرع تلقائي بيحفظ صف مخفي لنفس الابن جوه نفس الرئيسي', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/catalog?tab=map');

  await page.getByRole('button', { name: 'إخفاء تصنيف 1' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('POST');
  expect(writes[0].body).toMatchObject({ kind: 'node', node_id: 'c1', parent_id: 'm2', visible: false, sort_order: 0 });
});

test('خريطة العرض: الفروع التلقائية بتنزل مع الشجرة، وإخفاء فرع جوه فرع بيتحفظ تحت الرئيسي المخزّن', async ({ page }) => {
  const nodes = [...NODES, node('c1a', { id: 'c1a', parent_id: 'c1', slug: 'cat-1a', sort_web: 0 })].map((n) => (n.id === 'c1a' ? { ...n, name_ar: 'تصنيف 1 أ' } : n));
  const { writes } = await setUp(page, MENU, nodes);
  await page.goto('/catalog?tab=map');

  // the tree's third level shows as an automatic row inside the second, and says exactly where it sits
  const deep = page.locator('[data-testid="menu-sub"][data-level="3"]');
  await expect(deep).toHaveCount(1);
  await expect(deep.first().getByTestId('sub-placement').first()).toHaveText('فرعي داخل: سلسلة أ ‹ تصنيف 1');
  await expect(deep.first().getByText('تلقائي من الشجرة').first()).toBeVisible();

  // hiding it stores a hidden row under the stored item above (the main item), which stands in for its automatic copy
  await page.getByRole('button', { name: 'إخفاء تصنيف 1 أ' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toMatchObject({ kind: 'node', node_id: 'c1a', parent_id: 'm2', visible: false });
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
  expect(options).toEqual(['رئيسي', 'داخل: الرئيسية', 'داخل: سلسلة أ', 'داخل: تواصل معنا']);
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

test('صفحات الأقسام: الأشرطة (ترتيب وإخفاء بيتحفظوا فورًا) والكلام والفيديو والشكل بزرار حفظ واحد', async ({ page }) => {
  const { writes, rpcs } = await setUp(page);
  await fakeFrames(page);
  await page.goto('/catalog?tab=pages&node=s1');

  await expect(page.getByTestId('pages-editor')).toHaveAttribute('data-node-id', 's1');
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
  await page.getByTestId('media-video').click();
  await page.getByTestId('field-video').fill('http://not-secure.example/video');
  await page.getByTestId('field-layout').selectOption('strips');
  await expect(page.getByTestId('video-problem')).toBeVisible();
  await expect(page.getByTestId('pages-save')).toBeDisabled();
  expect(writes.length).toBe(1);

  await page.getByTestId('field-video').fill('https://www.youtube.com/watch?v=abc');
  await page.getByTestId('field-strips-limit').fill('8');
  await page.getByTestId('pages-save').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body).toEqual({ intro_ar: 'منهج متكامل لتعليم الأطفال', video_url: 'https://www.youtube.com/watch?v=abc', intro_media: 'video', page_layout: 'strips', strips_limit: 8 });
});

test('نافذة تعديل العنصر: «صفحة العرض» بقت مؤشر لتاب «صفحات الأقسام»، من غير خانات مكررة', async ({ page }) => {
  await setUp(page);
  await page.goto('/catalog');
  await page.getByRole('button', { name: 'تعديل سلسلة أ' }).click();
  await page.getByTestId('node-editor').getByRole('tab', { name: /صفحة العرض/ }).click();
  await expect(page.getByTestId('page-moved')).toContainText('صفحات الأقسام');
  await expect(page.getByTestId('field-intro-ar')).toHaveCount(0);
  await expect(page.getByTestId('field-video')).toHaveCount(0);
  await expect(page.getByTestId('field-layout')).toHaveCount(0);
  await page.getByTestId('open-page-editor').click();
  await expect(page).toHaveURL(/tab=pages/);
  await expect(page.getByTestId('pages-editor')).toHaveAttribute('data-node-id', 's1');
});

test('التابات: «أقسام المتجر» بعد «شريط التصنيفات» ثم «صفحات الأقسام»', async ({ page }) => {
  await setUp(page);
  await page.goto('/catalog');
  await expect(page.getByTestId('tab-departments')).toBeVisible();
  const labels = await page.getByRole('tablist', { name: 'أقسام السلاسل والتصنيفات' }).getByRole('tab').allInnerTexts();
  const names = labels.map((l) => l.replace(/\s+/g, ' ').trim());
  expect(names.indexOf('أقسام المتجر')).toBe(names.indexOf('شريط التصنيفات') + 1);
  expect(names.indexOf('صفحات الأقسام')).toBe(names.indexOf('أقسام المتجر') + 1);
});

test('أقسام المتجر: الكروت المحفوظة بترتيبها، وضغطة على «إضافة» بتعرض الموجود بس، والمعاينة بتاخد القايمة قبل الحفظ', async ({ page }) => {
  const { writes, rpcs } = await setUp(page);
  await fakeFrames(page);
  await page.goto('/catalog?tab=departments');

  const rows = page.getByTestId('dept-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('سلسلة أ');
  await expect(rows.nth(1)).toContainText('سلسلة ب');
  // سلسلة ب holds no books and is set to hide when empty: the card says it is not drawn
  await expect(rows.nth(1).getByTestId('dept-issue')).toContainText('فاضي');
  await expect(rows.nth(0).getByTestId('dept-issue')).toHaveCount(0);
  await expect(page.getByTestId('dept-save')).toBeDisabled();

  // the preview starts with the saved list
  await expect.poll(async () => (await lastMessage(page, 'site'))?.departments?.ids).toEqual(['s1', 's2']);
  expect((await lastMessage(page, 'site')).scroll).toBe('departments');

  // add: only what is not already a card, searchable, no new item is made
  await page.getByTestId('dept-add').click();
  const items = page.getByTestId('dept-add-item');
  await expect(items).toHaveText([/سلسلة فاضي|تصنيف 1/, /تصنيف 2/, /تصنيف فاضي|سلسلة فاضي/].map((r) => r));
  await page.getByTestId('dept-add-search').fill('تصنيف 1');
  await expect(items).toHaveCount(1);
  await items.first().click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('تصنيف 1');
  await expect(page.getByTestId('dept-dirty')).toBeVisible();
  // nothing is written until «حفظ»
  expect(writes).toEqual([]);
  expect(rpcs).toEqual([]);
  await expect.poll(async () => (await lastMessage(page, 'site'))?.departments?.ids).toEqual(['s1', 's2', 'c1']);
});

test('أقسام المتجر: حذف كارت وترتيب بالسحب وحفظ بخطوة واحدة (من غير حذف العنصر نفسه)', async ({ page }) => {
  const { writes, rpcs } = await setUp(page);
  await fakeFrames(page);
  await page.goto('/catalog?tab=departments');
  const rows = page.getByTestId('dept-row');
  await expect(rows).toHaveCount(2);

  await dragOnto(rows.nth(0).getByTestId('drag-handle'), rows.nth(1), 'after');
  await expect(rows.nth(0)).toContainText('سلسلة ب');
  await rows.nth(1).getByTestId('dept-remove').click();
  await expect(rows).toHaveCount(1);
  await page.getByTestId('dept-add').click();
  await page.getByTestId('dept-add-item').filter({ hasText: 'تصنيف 2' }).click();
  await expect(rows).toHaveCount(2);

  await page.getByTestId('dept-save').click();
  await expect.poll(() => rpcs.length).toBe(1);
  expect(rpcs[0]).toEqual({ name: 'store_departments_save', body: { p_node_ids: ['s2', 'c2'] } });
  // the items themselves are untouched: no picture changed, nothing deleted
  expect(writes).toEqual([]);
});

test('أقسام المتجر: الكارت اللي مخفي عن التطبيق بس بيتنبّه عليه، من غير ما يتقال إنه مش ظاهر في الموقع', async ({ page }) => {
  const nodes = NODES.map((n) => (n.id === 's1' ? { ...n, show_app: false } : n));
  await setUp(page, MENU, nodes);
  await fakeFrames(page);
  await page.goto('/catalog?tab=departments');

  const rows = page.getByTestId('dept-row');
  await expect(rows).toHaveCount(2);
  const chips = rows.nth(0).getByTestId('dept-issue');
  await expect(chips).toHaveCount(1);
  await expect(chips).toHaveAttribute('data-channel', 'app');
  await expect(chips).toContainText('مخفي عن التطبيق');
  await expect(chips).toHaveAttribute('title', /التطبيق/);
  // the website still draws it, and the card that is empty on both channels has one shared warning
  await expect(rows.nth(1).getByTestId('dept-issue')).toHaveCount(1);
  await expect(rows.nth(1).getByTestId('dept-issue')).toHaveAttribute('data-channel', 'both');
});

test('أقسام المتجر: تراجع بيرجّع الكل، ومفيش حفظ لو مفيش تغيير', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await fakeFrames(page);
  await page.goto('/catalog?tab=departments');
  const rows = page.getByTestId('dept-row');
  await rows.nth(1).getByTestId('dept-remove').click();
  await expect(rows).toHaveCount(1);
  await page.getByTestId('dept-reset').click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('dept-save')).toBeDisabled();
  expect(rpcs).toEqual([]);
});

test('أقسام المتجر: رفع صورة كارت بيظهر في المعاينة وبيتحفظ على العنصر نفسه مع الحفظ', async ({ page }) => {
  const { writes, rpcs } = await setUp(page);
  await fakeFrames(page);
  await page.route('**/storage/v1/object/series-images/**', (route) => route.fulfill({ status: 200, json: { Key: 'series-images/x.png' } }));
  await page.goto('/catalog?tab=departments');
  const rows = page.getByTestId('dept-row');
  await expect(rows).toHaveCount(2);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==', 'base64');
  await rows.nth(0).getByTestId('dept-picture-file').setInputFiles({ name: 'card.png', mimeType: 'image/png', buffer: png });
  await expect(rows.nth(0).getByTestId('dept-picture-remove')).toBeVisible();
  await expect.poll(async () => Object.keys((await lastMessage(page, 'site'))?.departments?.images ?? {})).toEqual(['s1']);
  expect((await lastMessage(page, 'site')).departments.ids).toEqual(['s1', 's2']);
  expect(writes).toEqual([]);

  await page.getByTestId('dept-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].url).toContain('id=eq.s1');
  expect(writes[0].body.image_url).toMatch(/\/series-images\/.+\.png$/);
  expect(rpcs[0]).toEqual({ name: 'store_departments_save', body: { p_node_ids: ['s1', 's2'] } });
});

test('أقسام المتجر: إزالة صورة كارت بتتحفظ، وصورة رجعت زي ما كانت مش تغيير', async ({ page }) => {
  const nodes = NODES.map((n) => (n.id === 's1' ? { ...n, image_url: 'https://img.test/s1.png' } : n));
  const { writes } = await setUp(page, MENU, nodes);
  await fakeFrames(page);
  await page.goto('/catalog?tab=departments');
  const rows = page.getByTestId('dept-row');
  await rows.nth(0).getByTestId('dept-picture-remove').click();
  await expect(page.getByTestId('dept-dirty')).toBeVisible();
  await page.getByTestId('dept-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toEqual({ image_url: null });
});

test('صفحات الأقسام: الاختيار من القايمة، والمعاينة بتاخد المسودة (الكلام والتنسيق) قبل الحفظ', async ({ page }) => {
  const { writes } = await setUp(page);
  await fakeFrames(page);
  await page.goto('/catalog?tab=pages');
  await expect(page.getByTestId('pages-empty')).toBeVisible();

  await page.getByTestId('pages-node-search').fill('سلسلة أ');
  await page.getByTestId('pages-node-row').filter({ hasText: 'سلسلة أ' }).first().click();
  await expect(page.getByTestId('pages-editor')).toHaveAttribute('data-node-id', 's1');
  await expect.poll(async () => (await lastMessage(page, 'site'))?.nodePage?.id).toBe('s1');
  expect((await lastMessage(page, 'site')).navigate).toBe('/books?series=s1');

  await page.getByTestId('field-intro-ar').fill('أهلًا بك');
  await page.getByTestId('media-video').click();
  await page.getByTestId('field-video').fill('https://youtu.be/abc12345678');
  await page.getByTestId('align-center').click();
  await page.getByTestId('pos-below').click();
  await page.getByTestId('field-font').fill('26');
  await page.getByTestId('field-pad-right').fill('40');
  await page.getByTestId('field-pad-left').fill('15');
  await expect(page.getByTestId('pages-dirty')).toBeVisible();

  await expect.poll(async () => (await lastMessage(page, 'site'))?.nodePage?.fields?.intro_align).toBe('center');
  const fields = (await lastMessage(page, 'site')).nodePage.fields;
  expect(fields).toMatchObject({
    intro_ar: 'أهلًا بك', intro_media: 'video', video_url: 'https://youtu.be/abc12345678', intro_align: 'center',
    intro_text_pos: 'below', intro_font_px: 26, intro_pad_right: 40, intro_pad_left: 15,
  });
  // nothing is written until «حفظ»
  expect(writes).toEqual([]);

  await page.getByTestId('pages-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].url).toContain('id=eq.s1');
  expect(writes[0].body).toEqual({
    intro_ar: 'أهلًا بك', video_url: 'https://youtu.be/abc12345678', intro_media: 'video', intro_align: 'center', intro_font_px: 26,
    intro_pad_right: 40, intro_pad_left: 15, intro_text_pos: 'below',
  });
});

test('صفحات الأقسام: صورة بدل الفيديو، و«تراجع» بيرجّع المحفوظ، ومكان الكلام بيتنبّه لو مفيش ميديا', async ({ page }) => {
  const { writes } = await setUp(page);
  await fakeFrames(page);
  await page.route('**/storage/v1/object/series-images/**', (route) => route.fulfill({ status: 200, json: { Key: 'series-images/x.png' } }));
  await page.goto('/catalog?tab=pages&node=s1');
  await expect(page.getByTestId('pages-editor')).toBeVisible();
  await expect(page.getByTestId('pos-note')).toBeVisible();

  await page.getByTestId('media-image').click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==', 'base64');
  await page.getByTestId('pages-picture-file').setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByTestId('pages-picture-remove')).toBeVisible();
  await expect(page.getByTestId('pos-note')).toHaveCount(0);
  await expect.poll(async () => (await lastMessage(page, 'site'))?.nodePage?.fields?.intro_media).toBe('image');
  expect((await lastMessage(page, 'site')).nodePage.fields.intro_image_url).toMatch(/series-images/);

  await page.getByTestId('pages-reset').click();
  await expect(page.getByTestId('pages-dirty')).toHaveCount(0);
  await expect(page.getByTestId('pages-save')).toBeDisabled();
  expect(writes).toEqual([]);
});

test('صفحات الأقسام: عنصر مخفي عن الموقع بيتنبّه، والتابات القديمة بتفتح من الرابط', async ({ page }) => {
  await setUp(page);
  await fakeFrames(page);
  await page.goto('/catalog?tab=pages&node=c3');
  await expect(page.getByTestId('pages-hidden-note')).toBeVisible();
  await expect(page).not.toHaveURL(/node=/);
});
