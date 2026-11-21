import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «الصفحة الرئيسية» in the catalog hub: the category shelves of the website's home page (which categories get a shelf,
// their order, title, how many books). Hermetic: no real sign-in, home_layout is kept in memory and every write is recorded.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const node = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, parent_id: null, type: 'category', name_ar: name, name_en: null, slug: id, description_ar: null, description_en: null,
  image_url: null, icon: null, color: null, is_active: true, featured: false, show_web: true, show_app: true, sort_web: 0, sort_app: 0,
  show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true, books_sort_web: 'manual', books_sort_app: 'manual',
  starts_at: null, ends_at: null, seo_title: null, seo_description: null, intro_ar: null, intro_en: null, video_url: null, page_layout: 'auto',
  strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
});
const NODES = [
  node('s1', 'سلسلة أ', { type: 'series' }),
  node('c1', 'نحو', { parent_id: 's1' }),
  node('c2', 'إملاء', { parent_id: 's1' }),
  node('c3', 'قصص'),
  node('hidden', 'مخفي عن الموقع', { show_web: false }),
];

interface Shelf { channel: string; section_key: string; kind: string; node_id: string | null; title_ar: string | null; item_limit: number | null; visible: boolean; sort_order: number }
const shelf = (id: string, order: number, over: Partial<Shelf> = {}): Shelf => ({
  channel: 'web', section_key: `shelf:${id}`, kind: 'category-shelf', node_id: id, title_ar: null, item_limit: null, visible: true, sort_order: order, ...over,
});

async function setUp(page: Page, initial: Shelf[] = []) {
  const shelves = [...initial];
  const writes: { method: string; url: string; body: any }[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const get = req.method() === 'GET' || req.method() === 'HEAD';
    if (url.includes('/rest/v1/rpc/catalog_node_counts')) return json(route, NODES.map((n) => ({ node_id: n.id, books_direct: 3, books_total: n.id === 's1' ? 9 : 3 })));
    if (url.includes('/rest/v1/catalog_nodes') && get) return json(route, NODES);
    if (url.includes('/rest/v1/home_layout')) {
      if (get) return json(route, [...shelves].sort((a, b) => a.sort_order - b.sort_order));
      const body = req.method() === 'DELETE' ? null : req.postDataJSON();
      writes.push({ method: req.method(), url, body });
      const key = new URL(url).searchParams.get('section_key')?.replace(/^eq\./, '');
      if (req.method() === 'POST') {
        const at = shelves.findIndex((s) => s.section_key === body.section_key);
        if (at >= 0) shelves[at] = { ...shelves[at], ...body }; else shelves.push(body);
      } else if (req.method() === 'PATCH') {
        const at = shelves.findIndex((s) => s.section_key === key);
        if (at >= 0) shelves[at] = { ...shelves[at], ...body };
      } else if (req.method() === 'DELETE') {
        const at = shelves.findIndex((s) => s.section_key === key);
        if (at >= 0) shelves.splice(at, 1);
      }
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
  await page.goto('/catalog?tab=home');
  return { writes, shelves };
}

const rows = (page: Page) => page.getByTestId('shelf-row');

test('من غير رفوف مختارة: رسالة إن الموقع بيعرض أول ٣ تصنيفات، وزر الإضافة', async ({ page }) => {
  await setUp(page);
  await expect(page.getByTestId('shelves-empty')).toContainText('أول 3 تصنيفات', { timeout: 20_000 });
  await expect(page.getByTestId('shelf-add')).toBeVisible();
});

test('إضافة رف: بيتحفظ بمفتاح التصنيف وبعنوانه وعدد كتبه، ويتحط في الآخر، والمخفي عن الموقع مش في الاختيارات', async ({ page }) => {
  const { writes } = await setUp(page, [shelf('c1', 0)]);
  await expect(rows(page)).toHaveCount(1, { timeout: 20_000 });
  await page.getByTestId('shelf-add').click();

  // the series and the other category can be chosen (with their place); the used one and the hidden one cannot
  const options = page.getByTestId('shelf-node').locator('option');
  await expect(options).toHaveText(['— اختار —', 'تصنيف: إملاء'.replace('إملاء', 'سلسلة أ ‹ إملاء'), 'تصنيف: قصص', 'سلسلة: سلسلة أ']);

  await page.getByTestId('shelf-node').selectOption({ label: 'تصنيف: قصص' });
  await page.getByTestId('shelf-title').fill('قصص مختارة');
  await page.getByTestId('shelf-limit').fill('8');
  await page.getByTestId('shelf-save').click();
  await expect(rows(page)).toHaveCount(2);
  const post = writes.find((w) => w.method === 'POST')!;
  expect(post.body).toMatchObject({
    channel: 'web', section_key: 'shelf:c3', kind: 'category-shelf', node_id: 'c3', title_ar: 'قصص مختارة', item_limit: 8, visible: true, sort_order: 1,
  });
  await expect(rows(page).nth(1)).toContainText('قصص مختارة');
  await expect(rows(page).nth(1)).toContainText('أول 8');
});

test('إضافة من غير اختيار أو بعدد كتب غلط: رسالة ومفيش حاجة بتتبعت', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.getByTestId('shelf-add').click();
  await page.getByTestId('shelf-save').click();
  await expect(page.getByTestId('shelf-problem')).toContainText('اختار');
  await page.getByTestId('shelf-node').selectOption({ label: 'تصنيف: قصص' });
  await page.getByTestId('shelf-limit').fill('100');
  await page.getByTestId('shelf-save').click();
  await expect(page.getByTestId('shelf-problem')).toContainText('1 لـ60');
  expect(writes).toHaveLength(0);
});

test('الإخفاء والتعديل والحذف', async ({ page }) => {
  const { writes } = await setUp(page, [shelf('c1', 0), shelf('c2', 1)]);
  await expect(rows(page)).toHaveCount(2, { timeout: 20_000 });

  await rows(page).nth(0).locator('label').click(); // the switch
  await expect.poll(() => writes.filter((w) => w.method === 'PATCH').length).toBe(1);
  expect(writes.find((w) => w.method === 'PATCH')!.body).toMatchObject({ visible: false });

  // editing keeps the node (it cannot be changed) and its place
  await page.getByRole('button', { name: 'تعديل رف إملاء' }).click();
  await expect(page.getByTestId('shelf-node')).toBeDisabled();
  await page.getByTestId('shelf-title').fill('إملاء للصغار');
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.filter((w) => w.method === 'POST').length).toBe(1);
  expect(writes.find((w) => w.method === 'POST')!.body).toMatchObject({ section_key: 'shelf:c2', title_ar: 'إملاء للصغار', sort_order: 1, visible: true });

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'حذف رف إملاء للصغار' }).click();
  await expect.poll(() => writes.filter((w) => w.method === 'DELETE').length).toBe(1);
  await expect(rows(page)).toHaveCount(1);
});

test('السحب بيرتب الرفوف: كل رف بيتاخد رقمه الجديد', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1200 });
  const { writes } = await setUp(page, [shelf('c1', 0), shelf('c2', 1), shelf('c3', 2)]);
  await expect(rows(page)).toHaveCount(3, { timeout: 20_000 });
  const handle = rows(page).nth(2).getByTestId('drag-handle');
  const first = rows(page).nth(0);
  const box = (await first.boundingBox())!;
  await handle.dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await first.dispatchEvent('dragover', { clientX: box.x + 10, clientY: box.y + 3, dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await first.dispatchEvent('drop', { clientX: box.x + 10, clientY: box.y + 3, dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await expect.poll(() => writes.filter((w) => w.method === 'PATCH').length).toBe(3);
  const order = writes.filter((w) => w.method === 'PATCH').map((w) => [decodeURIComponent(new URL(w.url).searchParams.get('section_key')!), w.body.sort_order]);
  expect(Object.fromEntries(order)).toEqual({ 'eq.shelf:c3': 0, 'eq.shelf:c1': 1, 'eq.shelf:c2': 2 });
});
