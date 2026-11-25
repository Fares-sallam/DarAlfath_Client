import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «دمج» in «السلاسل والتصنيفات»: the button on a tree row, who can be picked, what the screen says will happen, which name stays,
// the extra confirmation, and the one call that is sent. Hermetic: no real sign-in, every Supabase call is answered here.

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
// a series holding two categories, a loose category, a collection and a second series
const NODES = [
  node('s1', 'سلسلة أ', { type: 'series', sort_web: 0 }),
  node('c1', 'الكتابة', { parent_id: 's1', sort_web: 1 }),
  node('c2', 'الإملاء', { parent_id: 's1', sort_web: 2 }),
  node('c3', 'قصص', { sort_web: 3 }),
  node('col', 'إصدارات متنوعة', { type: 'collection', sort_web: 4 }),
  node('s2', 'سلسلة ب', { type: 'series', sort_web: 5 }),
  node('c2-kid', 'إملاء متقدم', { parent_id: 'c2', sort_web: 6 }),
];
// الإملاء: p1 (primary), p2 (primary, also an extra in الكتابة), p3 (extra). الكتابة: p4 (primary), p2 (extra)
const LINKS = [
  { product_id: 'p1', node_id: 'c2', is_primary: true, sort_order: 0, pinned: false },
  { product_id: 'p2', node_id: 'c2', is_primary: true, sort_order: 1, pinned: false },
  { product_id: 'p2', node_id: 'c1', is_primary: false, sort_order: 0, pinned: false },
  { product_id: 'p3', node_id: 'c2', is_primary: false, sort_order: 2, pinned: false },
  { product_id: 'p4', node_id: 'c1', is_primary: true, sort_order: 0, pinned: false },
];
const MENU = [{
  id: 'm1', channel: 'web', parent_id: null, kind: 'node', node_id: 'c2', label_ar: null, label_en: null, url: null, sort_order: 0, visible: true, auto_children: false,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}];

async function setUp(page: Page, history: Record<string, unknown>[] = []) {
  const rpcs: { name: string; body: any }[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const get = req.method() === 'GET' || req.method() === 'HEAD';
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) {
      if (rpc[1] === 'catalog_node_counts') return json(route, []);
      if (rpc[1] === 'catalog_merge_history') return json(route, history);
      rpcs.push({ name: rpc[1], body: req.postDataJSON() });
      if (rpc[1] === 'catalog_merge_nodes') {
        return json(route, { source_name: 'الإملاء', target_name: 'الكتابة', books_moved: 2, books_already_in_target: 1, children_moved: 1, menu_items: 1, home_blocks: 0, departments: 0 });
      }
      if (rpc[1] === 'catalog_unmerge_node') {
        return json(route, { restored_name: 'الإملاء', target_name: 'الكتابة', books_restored: 2, children_restored: 1, menu_items: 1 });
      }
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.includes('/rest/v1/catalog_nodes') && get) return json(route, NODES);
    if (url.includes('/rest/v1/product_nodes') && get) return json(route, LINKS);
    if (url.includes('/rest/v1/menu_items') && get) return json(route, MENU);
    if (url.includes('/rest/v1/store_departments') && get) return json(route, [{ node_id: 'c2', sort_order: 0 }]);
    if (get) return json(route, []);
    return route.fallback();
  });
  return { rpcs };
}

const open = async (page: Page, name: string) => {
  await page.goto('/catalog');
  // open the series so its categories are in the list
  await page.getByRole('button', { name: 'فتح', exact: true }).first().click();
  await page.getByRole('button', { name: `دمج ${name}` }).click();
  await expect(page.getByTestId('merge-dialog')).toBeVisible();
};

test('دمج: الزرار على كل صف، والاختيار من نفس النوع بس (من غير نفسه ولا اللي جواه)', async ({ page }) => {
  await setUp(page);
  await open(page, 'الإملاء');
  const candidates = page.getByTestId('merge-candidate');
  // categories and the collection: not the category itself, not its own child, not the series
  await expect(candidates).toHaveText([/إصدارات متنوعة/, /الكتابة/, /قصص/]);
  await page.getByTestId('merge-search').fill('كتاب');
  await expect(candidates).toHaveCount(1);
  await expect(candidates.first()).toContainText('الكتابة');
});

test('دمج: بيعرض اللي هيحصل بالأرقام، وعكس الاتجاه، والاسم بعد الدمج', async ({ page }) => {
  await setUp(page);
  await open(page, 'الإملاء');
  await page.getByTestId('merge-candidate').filter({ hasText: 'الكتابة' }).click();

  await expect(page.getByTestId('merge-vanishing')).toContainText('الإملاء');
  await expect(page.getByTestId('merge-survivor')).toContainText('الكتابة');
  const effects = page.getByTestId('merge-effects');
  // p1 and p3 move (p1 is primary), p2 is already in الكتابة; one category under it; one header link
  await expect(effects).toContainText('2 كتاب هينتقل');
  await expect(effects).toContainText('منهم 1 تصنيفه الأساسي «الإملاء»');
  await expect(effects).toContainText('1 كتاب موجود في الاتنين');
  await expect(effects).toContainText('1 عنصر تحت «الإملاء» هينتقل تحت «الكتابة»');
  await expect(effects).toContainText('1 رابط في قايمة الهيدر');
  await expect(effects).toContainText('«أقسام المتجر»');
  await expect(page.getByTestId('merge-name')).toHaveValue('الكتابة');

  // the other direction: «الكتابة» goes away and the numbers follow
  await page.getByTestId('merge-swap').click();
  await expect(page.getByTestId('merge-vanishing')).toContainText('الكتابة');
  await expect(page.getByTestId('merge-survivor')).toContainText('الإملاء');
  await expect(effects).toContainText('1 كتاب هينتقل');
  await expect(page.getByTestId('merge-name')).toHaveValue('الإملاء');
});

test('دمج: تأكيد تاني قبل الحذف، وبعدها نداء واحد بالعنصرين والاسم', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await open(page, 'الإملاء');
  await expect(page.getByTestId('merge-go')).toBeDisabled();
  await page.getByTestId('merge-candidate').filter({ hasText: 'الكتابة' }).click();
  await page.getByTestId('merge-name').fill('الكتابة والإملاء');
  await page.getByTestId('merge-go').click();
  await expect(page.getByTestId('merge-confirm-box')).toContainText('«الإملاء» هيتحذف');
  expect(rpcs.filter((r) => r.name === 'catalog_merge_nodes')).toHaveLength(0);

  await page.getByTestId('merge-confirm').click();
  await expect.poll(() => rpcs.filter((r) => r.name === 'catalog_merge_nodes').length).toBe(1);
  expect(rpcs.find((r) => r.name === 'catalog_merge_nodes')!.body).toEqual({ p_source: 'c2', p_target: 'c1', p_new_name: 'الكتابة والإملاء' });
  await expect(page.getByTestId('merge-dialog')).toHaveCount(0);
  await expect(page.getByText('تم دمج «الإملاء» في «الكتابة»')).toBeVisible();
});

test('دمج: من غير تغيير الاسم مفيش اسم جديد بيتبعت، والإلغاء مش بيبعت حاجة', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await open(page, 'الإملاء');
  await page.getByTestId('merge-candidate').filter({ hasText: 'قصص' }).click();
  await page.getByTestId('merge-go').click();
  await page.getByTestId('merge-confirm').click();
  await expect.poll(() => rpcs.filter((r) => r.name === 'catalog_merge_nodes').length).toBe(1);
  expect(rpcs.find((r) => r.name === 'catalog_merge_nodes')!.body).toEqual({ p_source: 'c2', p_target: 'c3', p_new_name: null });

  rpcs.length = 0;
  await open(page, 'الإملاء');
  await page.getByTestId('merge-cancel').click();
  await expect(page.getByTestId('merge-dialog')).toHaveCount(0);
  expect(rpcs.filter((r) => r.name === 'catalog_merge_nodes')).toHaveLength(0);
});

const HISTORY = [
  { old_id: 'old-1', source_name: 'الإملاء القديم', target_id: 'c1', target_name: 'الكتابة', merged_at: '2026-11-24T10:00:00Z', summary: { books_moved: 2, books_already_in_target: 1, children_moved: 1, menu_items: 1 }, can_undo: true },
  { old_id: 'old-2', source_name: 'قصص قديمة', target_id: 'c3', target_name: 'قصص', merged_at: '2026-11-23T10:00:00Z', summary: { books_moved: 0 }, can_undo: false },
];

test('قسم الدمج ظاهر دايمًا فوق الشجرة، حتى قبل أول دمج: زرار «دمج عنصرين» ومكان التراجع', async ({ page }) => {
  await setUp(page);
  await page.goto('/catalog');
  await expect(page.getByTestId('catalog-tree')).toBeVisible();
  await expect(page.getByTestId('merge-history')).toBeVisible();
  await expect(page.getByTestId('merge-history-empty')).toContainText('بعد أول دمج هتظهر هنا');
  await expect(page.getByTestId('merge-history-row')).toHaveCount(0);

  // the button asks which item first, then the same dialog as the icon on a row
  await page.getByTestId('merge-pick').click();
  await expect(page.getByTestId('merge-pick-dialog')).toBeVisible();
  await page.getByTestId('merge-pick-search').fill('إملاء');
  await expect(page.getByTestId('merge-pick-item')).toHaveCount(2);
  await page.getByTestId('merge-pick-item').filter({ hasText: /^الإملاء/ }).click();
  await expect(page.getByTestId('merge-pick-dialog')).toHaveCount(0);
  await expect(page.getByTestId('merge-dialog')).toContainText('دمج «الإملاء»');
  await expect(page.getByTestId('merge-candidate')).toHaveText([/إصدارات متنوعة/, /الكتابة/, /قصص/]);
});

test('التراجع من القايمة: تأكيد الأول، وبعدها نداء واحد بـ id العنصر اللي اندمج', async ({ page }) => {
  const { rpcs } = await setUp(page, HISTORY);
  await page.goto('/catalog');
  const rows = page.getByTestId('merge-history-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('«الإملاء القديم» اندمج في «الكتابة»');
  await expect(rows.nth(0)).toContainText('3 كتاب، 1 عنصر تحته، 1 رابط هيدر');
  // the second one cannot be undone any more (what it was merged into was merged again)
  await expect(rows.nth(1).getByTestId('undo-merge')).toBeDisabled();

  await rows.nth(0).getByTestId('undo-merge').click();
  await expect(page.getByTestId('undo-confirm-box')).toContainText('يرجّع «الإملاء القديم»');
  expect(rpcs.filter((r) => r.name === 'catalog_unmerge_node')).toHaveLength(0);
  await page.getByTestId('undo-confirm').click();
  await expect.poll(() => rpcs.filter((r) => r.name === 'catalog_unmerge_node').length).toBe(1);
  expect(rpcs.find((r) => r.name === 'catalog_unmerge_node')!.body).toEqual({ p_old_id: 'old-1' });
  await expect(page.getByText('تم التراجع: «الإملاء» رجع لوحده')).toBeVisible();
});

test('التراجع من الرسالة: بعد الدمج بتظهر رسالة فيها «تراجع» بتبعت نداء التراجع للعنصر اللي اتدمج', async ({ page }) => {
  const { rpcs } = await setUp(page);
  await open(page, 'الإملاء');
  await page.getByTestId('merge-candidate').filter({ hasText: 'الكتابة' }).click();
  await page.getByTestId('merge-go').click();
  await page.getByTestId('merge-confirm').click();
  await expect(page.getByText('تم دمج «الإملاء» في «الكتابة»')).toBeVisible();

  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'تراجع' }).click();
  await expect.poll(() => rpcs.filter((r) => r.name === 'catalog_unmerge_node').length).toBe(1);
  expect(rpcs.find((r) => r.name === 'catalog_unmerge_node')!.body).toEqual({ p_old_id: 'c2' });
  await expect(page.getByText('تم التراجع: «الإملاء» رجع لوحده')).toBeVisible();
});
