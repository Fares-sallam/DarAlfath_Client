import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «الصفحة الرئيسية» in the catalog hub: the website's home page, top to bottom, in one list: the seven standard blocks and the
// category shelves in ONE order (drag), each shown or hidden, with its own title, line and book count; and the strip on a book's
// page. Hermetic: no real sign-in, home_layout is kept in memory and every write is recorded.

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

interface Row { channel: string; section_key: string; kind: string; node_id: string | null; title_ar: string | null; subtitle_ar: string | null; item_limit: number | null; visible: boolean; sort_order: number }
const std = (key: string, order: number, over: Partial<Row> = {}): Row => ({
  channel: 'web', section_key: key, kind: key, node_id: null, title_ar: null, subtitle_ar: null, item_limit: null, visible: true, sort_order: order, ...over,
});
const shelf = (id: string, order: number, over: Partial<Row> = {}): Row => ({
  channel: 'web', section_key: `shelf:${id}`, kind: 'category-shelf', node_id: id, title_ar: null, subtitle_ar: null, item_limit: null, visible: true, sort_order: order, ...over,
});
const STANDARD = ['departments', 'best-sellers', 'new-arrivals', 'offers', 'categories', 'intro-videos', 'features'];
const seed = () => STANDARD.map((key, i) => std(key, i, key === 'new-arrivals' ? { visible: false } : key === 'categories' ? { item_limit: 3 } : {}));

async function setUp(page: Page, initial: Row[] = seed()) {
  const state = [...initial];
  const writes: { method: string; url: string; body: any }[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const get = req.method() === 'GET' || req.method() === 'HEAD';
    if (url.includes('/rest/v1/rpc/catalog_node_counts')) return json(route, NODES.map((n) => ({ node_id: n.id, books_direct: 3, books_total: n.id === 's1' ? 9 : 3 })));
    if (url.includes('/rest/v1/catalog_nodes') && get) return json(route, NODES);
    if (url.includes('/rest/v1/home_layout')) {
      if (get) return json(route, [...state].sort((a, b) => a.sort_order - b.sort_order));
      const body = req.method() === 'DELETE' ? null : req.postDataJSON();
      writes.push({ method: req.method(), url, body });
      if (req.method() === 'POST') {
        for (const incoming of body as Row[]) {
          const at = state.findIndex((s) => s.section_key === incoming.section_key);
          if (at >= 0) state[at] = { ...state[at], ...incoming }; else state.push(incoming);
        }
      } else if (req.method() === 'DELETE') {
        const key = new URL(url).searchParams.get('section_key')?.replace(/^eq\./, '');
        const at = state.findIndex((s) => s.section_key === key);
        if (at >= 0) state.splice(at, 1);
      }
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
  await page.goto('/catalog?tab=home');
  await expect(page.getByTestId('home-blocks')).toBeVisible({ timeout: 20_000 });
  return { writes, state };
}

const items = (page: Page) => page.locator('[data-testid^="home-block-"], [data-testid="shelf-row"]');
const keysShown = (page: Page) => items(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.replace('home-block-', '')));
const lastPost = (writes: { method: string; body: any }[]) => [...writes].reverse().find((w) => w.method === 'POST')!.body as Row[];

test('القايمة: كل أقسام الصفحة السبعة بترتيبها، والمقفول (وصل حديثًا) مقفول', async ({ page }) => {
  await setUp(page);
  await expect(items(page)).toHaveCount(7);
  expect(await keysShown(page)).toEqual(STANDARD);
  await expect(page.getByTestId('home-block-new-arrivals').locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(page.getByTestId('home-block-best-sellers').locator('input[type="checkbox"]')).toBeChecked();
});

test('قاعدة البيانات فاضية: القايمة بترتيب الصفحة الأصلي، وأول تعديل بيكتب كل الأقسام', async ({ page }) => {
  const { writes } = await setUp(page, []);
  await expect(items(page)).toHaveCount(7);
  expect(await keysShown(page)).toEqual(STANDARD);
  await page.getByTestId('home-block-offers').locator('label').click(); // the switch
  await expect.poll(() => writes.length).toBe(1);
  const rows = lastPost(writes);
  expect(rows.map((r) => r.section_key)).toEqual(STANDARD);
  expect(rows.find((r) => r.section_key === 'offers')!.visible).toBe(false);
  expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
});

test('السحب: بيرتب كل الأقسام برقم جديد في طلب واحد', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1400 });
  const { writes } = await setUp(page);
  const handle = items(page).nth(3).getByTestId('drag-handle'); // offers
  const first = items(page).nth(0);
  const box = (await first.boundingBox())!;
  await handle.dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await first.dispatchEvent('dragover', { clientX: box.x + 10, clientY: box.y + 3, dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await first.dispatchEvent('drop', { clientX: box.x + 10, clientY: box.y + 3, dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await expect.poll(() => writes.length).toBe(1);
  expect(lastPost(writes).map((r) => r.section_key)).toEqual(['offers', 'departments', 'best-sellers', 'new-arrivals', 'categories', 'intro-videos', 'features']);
  expect(await keysShown(page)).toEqual(['offers', 'departments', 'best-sellers', 'new-arrivals', 'categories', 'intro-videos', 'features']);
});

test('تعديل عنوان وعدد: «وصل حديثًا» بعنوان جديد وعدد ٦، وبيحتفظ باللي تاني', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.getByRole('button', { name: 'تعديل وصل حديثًا' }).click();
  await expect(page.getByTestId('shelf-node')).toHaveCount(0);
  await expect(page.getByTestId('shelf-title')).toHaveAttribute('placeholder', 'وصل حديثًا');
  await expect(page.getByTestId('shelf-limit')).toHaveAttribute('placeholder', '12');
  await page.getByTestId('shelf-title').fill('جديدنا');
  await page.getByTestId('shelf-subtitle').fill('وصلت امبارح');
  await page.getByTestId('shelf-limit').fill('6');
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(lastPost(writes).find((r) => r.section_key === 'new-arrivals')).toMatchObject({ title_ar: 'جديدنا', subtitle_ar: 'وصلت امبارح', item_limit: 6, visible: false });
  await expect(page.getByTestId('home-block-new-arrivals')).toContainText('جديدنا');
});

test('كل بلوك ليه الخانات المناسبة بس: المزايا من غير تعديل، الفيديوهات عنوان وسطر، صفوف التصنيفات عدد بس', async ({ page }) => {
  await setUp(page);
  await expect(page.getByRole('button', { name: /^تعديل مربعات المزايا/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^تعديل فيديوهات/ }).click();
  await expect(page.getByTestId('shelf-title')).toBeVisible();
  await expect(page.getByTestId('shelf-subtitle')).toBeVisible();
  await expect(page.getByTestId('shelf-limit')).toHaveCount(0);
  await page.getByRole('button', { name: 'إلغاء' }).click();
  await page.getByRole('button', { name: /^تعديل .*صفوف التصنيفات/ }).click();
  await expect(page.getByTestId('shelf-title')).toHaveCount(0);
  await expect(page.getByTestId('shelf-limit')).toHaveAttribute('placeholder', '3');
});

test('إضافة رف تصنيف: بيتحط في الآخر بين الأقسام، والمخفي عن الموقع مش في الاختيارات، و«صفوف التصنيفات» بتتعلّم إنها اتبدّلت', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.getByTestId('shelf-add').click();
  const options = page.getByTestId('shelf-node').locator('option');
  await expect(options).toHaveText(['— اختار —', 'تصنيف: سلسلة أ ‹ إملاء', 'تصنيف: سلسلة أ ‹ نحو', 'تصنيف: قصص', 'سلسلة: سلسلة أ']);
  await page.getByTestId('shelf-node').selectOption({ label: 'تصنيف: قصص' });
  await page.getByTestId('shelf-title').fill('قصص مختارة');
  await page.getByTestId('shelf-limit').fill('8');
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(lastPost(writes).at(-1)).toMatchObject({ section_key: 'shelf:c3', kind: 'category-shelf', node_id: 'c3', title_ar: 'قصص مختارة', item_limit: 8, visible: true, sort_order: 7 });
  await expect(page.getByTestId('shelf-row')).toHaveCount(1);
  await expect(page.getByTestId('home-block-categories')).toContainText('بدلها الرفوف المختارة');
});

test('إضافة من غير اختيار أو بعدد غلط: رسالة ومفيش حاجة بتتبعت', async ({ page }) => {
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

test('حذف رف: بيتشال هو بس، والأقسام التانية زي ما هي', async ({ page }) => {
  const { writes } = await setUp(page, [...seed(), shelf('c1', 7), shelf('c2', 8)]);
  await expect(items(page)).toHaveCount(9);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'حذف رف نحو' }).click();
  await expect.poll(() => writes.filter((w) => w.method === 'DELETE').length).toBe(1);
  await expect(items(page)).toHaveCount(8);
  expect(await keysShown(page)).toEqual([...STANDARD, 'shelf:c2'].map((k) => (k.startsWith('shelf:') ? 'shelf-row' : k)));
});

test('«كتب قد تعجبك» في صفحة الكتاب: إخفاء، وعنوان، وعدد من ١ لـ١٢', async ({ page }) => {
  const { writes } = await setUp(page);
  const card = page.getByTestId('page-strip-book-related');
  await card.locator('label').first().click();
  await expect.poll(() => writes.length).toBe(1);
  expect(lastPost(writes)[0]).toMatchObject({ section_key: 'page:book-related', kind: 'page-strip', visible: false, item_limit: null, title_ar: null });

  await page.getByTestId('related-title').fill('ممكن يعجبك');
  await page.getByTestId('related-limit').fill('20');
  await page.getByTestId('related-save').click();
  await expect(page.getByTestId('shelf-problem')).toHaveCount(0);
  expect(writes).toHaveLength(1); // 20 is too many: nothing sent
  await page.getByTestId('related-limit').fill('6');
  await page.getByTestId('related-save').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(lastPost(writes)[0]).toMatchObject({ title_ar: 'ممكن يعجبك', item_limit: 6, visible: false });
});
