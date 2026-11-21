import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «الصفحة الرئيسية» in the catalog hub, the extra controls: every block can be scheduled (from / until), limited to countries
// and to phones or computers (website); three new kinds of block (hand-picked books, a rule shelf, a promo strip); and the
// «انسخ الترتيب» button that makes one channel follow the other. Hermetic: home_layout is kept in memory, writes are recorded.

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
const NODES = [node('s1', 'سلسلة أ', { type: 'series' }), node('c1', 'نحو', { parent_id: 's1' }), node('c2', 'إملاء', { parent_id: 's1' })];

const BOOKS = [
  { id: '11111111-1111-1111-1111-111111111111', title: 'قواعد النحو الميسر', author: 'محمد القليعي' },
  { id: '22222222-2222-2222-2222-222222222222', title: 'قواعد الإملاء', author: 'عبدالرحمن بكر' },
  { id: '33333333-3333-3333-3333-333333333333', title: 'قصص الأنبياء', author: null },
];
const COUNTRIES = [
  { id: 'eg', name: 'مصر', code: 'EG', currency: 'EGP', currency_symbol: 'ج.م', is_active: true },
  { id: 'sa', name: 'السعودية', code: 'SA', currency: 'SAR', currency_symbol: 'ر.س', is_active: true },
];

interface Row {
  channel: string; section_key: string; kind: string; node_id: string | null; title_ar: string | null; subtitle_ar: string | null; item_limit: number | null;
  visible: boolean; sort_order: number; starts_at: string | null; ends_at: string | null; countries: string[] | null; devices: string; config: Record<string, unknown>;
}
const std = (key: string, order: number, over: Partial<Row> = {}, channel = 'web'): Row => ({
  channel, section_key: key, kind: key, node_id: null, title_ar: null, subtitle_ar: null, item_limit: null, visible: true, sort_order: order,
  starts_at: null, ends_at: null, countries: null, devices: 'all', config: {}, ...over,
});
const STANDARD = ['departments', 'best-sellers', 'new-arrivals', 'offers', 'categories', 'intro-videos', 'features'];
const APP_STANDARD = ['departments', 'best-sellers', 'new-arrivals', 'offers', 'ebook-library', 'categories', 'intro-videos', 'features'];
const seedWeb = () => STANDARD.map((key, i) => std(key, i));
const seedApp = () => APP_STANDARD.map((key, i) => std(key, i, {}, 'app'));

interface Write { method: string; url: string; body: any }

async function setUp(page: Page, initial: Row[] = [...seedWeb(), ...seedApp()], url = '/catalog?tab=home') {
  const state = [...initial];
  const writes: Write[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/storage/v1/object/**', (route) => json(route, { Key: 'site-assets/home-blocks/x.png' }));
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const href = req.url();
    const get = req.method() === 'GET' || req.method() === 'HEAD';
    const params = new URL(href).searchParams;
    if (href.includes('/rest/v1/rpc/catalog_node_counts')) return json(route, NODES.map((n) => ({ node_id: n.id, books_direct: 3, books_total: 3 })));
    if (href.includes('/rest/v1/rpc/home_layout_apply')) {
      const body = req.postDataJSON();
      writes.push({ method: 'RPC', url: href, body });
      // what the database function does: delete the listed keys, write the rows
      for (const key of body.p_remove ?? []) {
        const at = state.findIndex((s) => s.channel === body.p_channel && s.section_key === key);
        if (at >= 0) state.splice(at, 1);
      }
      for (const incoming of body.p_rows as Row[]) {
        const at = state.findIndex((s) => s.channel === body.p_channel && s.section_key === incoming.section_key);
        const merged = { ...incoming, channel: body.p_channel };
        if (at >= 0) state[at] = { ...state[at], ...merged }; else state.push(merged);
      }
      return route.fulfill({ status: 204, body: '' });
    }
    if (href.includes('/rest/v1/catalog_nodes') && get) return json(route, NODES);
    if (href.includes('/rest/v1/countries') && get) return json(route, COUNTRIES);
    if ((href.includes('/rest/v1/categories') || href.includes('/rest/v1/book_series')) && get) return json(route, []);
    if (href.includes('/rest/v1/products') && get) {
      const idFilter = params.get('id');
      if (idFilter?.startsWith('in.')) {
        const ids = idFilter.slice(4, -1).split(',');
        return json(route, BOOKS.filter((b) => ids.includes(b.id)));
      }
      const words = (params.get('title') ?? '').replace(/^ilike\./, '').replace(/%/g, '');
      return json(route, BOOKS.filter((b) => b.title.includes(words)));
    }
    if (href.includes('/rest/v1/home_layout')) {
      if (get) {
        const wanted = params.get('channel')?.replace(/^eq\./, '') ?? 'web';
        return json(route, state.filter((r) => r.channel === wanted).sort((a, b) => a.sort_order - b.sort_order));
      }
      const body = req.method() === 'DELETE' ? null : req.postDataJSON();
      writes.push({ method: req.method(), url: href, body });
      if (req.method() === 'POST') {
        for (const incoming of body as Row[]) {
          const at = state.findIndex((s) => s.section_key === incoming.section_key && s.channel === incoming.channel);
          if (at >= 0) state[at] = { ...state[at], ...incoming }; else state.push(incoming);
        }
      } else if (req.method() === 'DELETE') {
        const key = params.get('section_key')?.replace(/^eq\./, '');
        const channel = params.get('channel')?.replace(/^eq\./, '');
        const at = state.findIndex((s) => s.section_key === key && s.channel === channel);
        if (at >= 0) state.splice(at, 1);
      }
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
  await page.goto(url);
  await expect(page.getByTestId('home-blocks')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-testid^="home-block-"]').first()).toBeVisible({ timeout: 20_000 });
  return { writes, state };
}

const lastPost = (writes: Write[]) => [...writes].reverse().find((w) => w.method === 'POST')!.body as Row[];
const rowOf = (rows: Row[], key: string) => rows.find((r) => r.section_key === key)!;
const localIso = (page: Page, y: number, m: number, d: number, h: number, mi: number) =>
  page.evaluate(([a, b, c, e, f]) => new Date(a, b - 1, c, e, f).toISOString(), [y, m, d, h, mi]);

test('جدولة بلوك: من وإلى + دولة + جهاز بتتحفظ على الصف، وبتظهر كشارات في القايمة', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.getByRole('button', { name: /^تعديل عروض وخصومات/ }).click();
  await expect(page.getByTestId('block-window')).toBeVisible();
  await page.getByTestId('block-starts').fill('2099-12-01T09:00');
  await page.getByTestId('block-ends').fill('2099-12-20T23:30');
  await page.getByTestId('block-country-EG').check();
  await page.getByTestId('block-devices').selectOption('mobile');
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(1);
  const offers = rowOf(lastPost(writes), 'offers');
  expect(offers.starts_at).toBe(await localIso(page, 2099, 12, 1, 9, 0));
  expect(offers.ends_at).toBe(await localIso(page, 2099, 12, 20, 23, 30));
  expect(offers.countries).toEqual(['EG']);
  expect(offers.devices).toBe('mobile');
  // untouched blocks keep their (empty) window
  expect(rowOf(lastPost(writes), 'features')).toMatchObject({ starts_at: null, ends_at: null, countries: null, devices: 'all' });
  const chips = page.getByTestId('home-block-offers').getByTestId('window-chips');
  await expect(chips.locator('[data-chip="upcoming"]')).toBeVisible();
  await expect(chips.locator('[data-chip="countries"]')).toHaveText('مصر');
  await expect(chips.locator('[data-chip="devices"]')).toHaveText('الموبايل بس');
});

test('بلوك انتهى ميعاده بيتعلّم «انتهى» وبيتعتّم، وتواريخ مقلوبة ما بتتحفظش', async ({ page }) => {
  const past = std('offers', 3, { starts_at: '2020-01-01T00:00:00Z', ends_at: '2020-02-01T00:00:00Z' });
  const { writes } = await setUp(page, [...seedWeb().map((r) => (r.section_key === 'offers' ? past : r)), ...seedApp()]);
  const offers = page.getByTestId('home-block-offers');
  await expect(offers.locator('[data-chip="ended"]')).toBeVisible();
  await expect(offers.locator('p').first()).toHaveClass(/line-through/);

  await page.getByRole('button', { name: /^تعديل عروض وخصومات/ }).click();
  await page.getByTestId('block-starts').fill('2099-12-10T10:00');
  await page.getByTestId('block-ends').fill('2099-12-09T10:00');
  await page.getByTestId('shelf-save').click();
  await expect(page.getByTestId('shelf-problem')).toContainText('بعد تاريخ البداية');
  expect(writes).toHaveLength(0);
});

test('التطبيق: التحكم بالتاريخ بس (من غير دول ولا أجهزة)، مع تنبيه إنه للنسخة الجاية', async ({ page }) => {
  await setUp(page, undefined, '/catalog?tab=home&channel=app');
  await page.getByRole('button', { name: /^تعديل عروض وخصومات/ }).click();
  await expect(page.getByTestId('block-starts')).toBeVisible();
  await expect(page.getByTestId('block-countries')).toHaveCount(0);
  await expect(page.getByTestId('block-devices')).toHaveCount(0);
  await expect(page.getByTestId('window-app-note')).toBeVisible();
});

test('رف كتب مختارة: بحث وإضافة وترتيب، وبيتحفظ بمفتاح block: وبالترتيب المختار', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.getByTestId('add-book-shelf').click();
  await expect(page.getByTestId('form-kind')).toContainText('رف كتب مختارة');

  // nothing chosen yet
  await page.getByTestId('shelf-save').click();
  await expect(page.getByTestId('shelf-problem')).toContainText('كتاب واحد');
  expect(writes).toHaveLength(0);

  await page.getByTestId('picker-search').fill('قواعد');
  await page.getByTestId(`picker-add-${BOOKS[0].id}`).click();
  await page.getByTestId('picker-search').fill('قواعد');
  await page.getByTestId(`picker-add-${BOOKS[1].id}`).click();
  await expect(page.getByTestId('picker-row')).toHaveCount(2);
  await expect(page.getByTestId('picker-row').first()).toContainText('قواعد النحو الميسر');
  // the keyboard on the grip moves the second one up
  await page.getByTestId('picker-row').nth(1).locator('button').first().focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('picker-row').first()).toContainText('قواعد الإملاء');

  await page.getByTestId('shelf-title').fill('مختارات الأسبوع');
  await page.getByTestId('shelf-limit').fill('5');
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(1);
  const saved = lastPost(writes).find((r) => r.kind === 'book-shelf')!;
  expect(saved.section_key).toMatch(/^block:[0-9a-f-]{36}$/);
  expect(saved).toMatchObject({ title_ar: 'مختارات الأسبوع', item_limit: 5, node_id: null, visible: true, sort_order: 7, channel: 'web' });
  expect((saved.config as any).product_ids).toEqual([BOOKS[1].id, BOOKS[0].id]);

  const row = page.locator('[data-kind="book-shelf"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('مختارات الأسبوع');
  await expect(row.getByTestId('kind-badge')).toHaveText('رف كتب مختارة');
  await expect(row).toContainText('2 كتاب مختار');
});

test('تعديل رف كتب مختارة: الكتب بتتقري بأسمائها وبتتشال واحد واحد', async ({ page }) => {
  const shelf = std('block:abc', 7, { kind: 'book-shelf', title_ar: 'مختارات', config: { product_ids: [BOOKS[0].id, BOOKS[1].id] } });
  const { writes } = await setUp(page, [...seedWeb(), shelf, ...seedApp()]);
  await page.getByRole('button', { name: /^تعديل مختارات/ }).click();
  await expect(page.getByTestId('picker-row')).toHaveCount(2);
  await expect(page.getByTestId('picker-chosen')).toContainText('قواعد الإملاء');
  await page.getByTestId(`picker-remove-${BOOKS[0].id}`).click();
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect((rowOf(lastPost(writes), 'block:abc').config as any).product_ids).toEqual([BOOKS[1].id]);
});

test('رف بقاعدة: القاعدة والجزء والعدد، ومن غير جزء = المتجر كله', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.getByTestId('add-filter-shelf').click();
  await page.getByTestId('filter-source').selectOption('offers');
  await page.getByTestId('filter-node').selectOption('c1');
  await page.getByTestId('shelf-limit').fill('8');
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(1);
  const first = lastPost(writes).find((r) => r.kind === 'filter-shelf')!;
  expect(first).toMatchObject({ node_id: 'c1', item_limit: 8, title_ar: null, config: { source: 'offers' } });

  await page.getByTestId('add-filter-shelf').click();
  await page.getByTestId('filter-source').selectOption('ebooks');
  await expect(page.getByTestId('shelf-title')).toHaveAttribute('placeholder', 'كتب إلكترونية');
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(2);
  const second = lastPost(writes).filter((r) => r.kind === 'filter-shelf').at(-1)!;
  expect(second).toMatchObject({ node_id: null, config: { source: 'ebooks' } });
  await expect(page.locator('[data-kind="filter-shelf"]')).toHaveCount(2);
});

test('شريط إعلان: عنوان ونص وصورة ورابط وزر ولون، وبيتحقق من الناقص قبل الحفظ', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.getByTestId('add-promo').click();
  await page.getByTestId('shelf-save').click();
  await expect(page.getByTestId('shelf-problem')).toContainText('اكتب عنوان');

  await page.getByTestId('shelf-title').fill('خصم الشتاء');
  await page.getByTestId('shelf-subtitle').fill('على كل كتب النحو');
  await page.getByTestId('promo-button').fill('تصفح الآن');
  await page.getByTestId('shelf-save').click();
  await expect(page.getByTestId('shelf-problem')).toContainText('وجهة'); // a button with nowhere to go
  expect(writes).toHaveLength(0);

  const fields = page.getByTestId('promo-fields');
  await fields.getByLabel('نوع الوجهة').selectOption('static');
  await fields.getByLabel('الصفحة', { exact: true }).selectOption('/search?sort=newest');
  await page.getByTestId('promo-tone').selectOption('brand');
  // a picture
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.getByTestId('promo-image').locator('input[type="file"]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByTestId('promo-image').locator('img')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(1);
  const promo = lastPost(writes).find((r) => r.kind === 'promo')!;
  expect(promo).toMatchObject({ title_ar: 'خصم الشتاء', subtitle_ar: 'على كل كتب النحو' });
  expect(promo.config).toMatchObject({ tone: 'brand', link_url: '/search?sort=newest', button_label: 'تصفح الآن' });
  expect(String((promo.config as any).image_url)).toMatch(/^https:\/\/.+\/home-blocks\/.+/);
  await expect(page.locator('[data-kind="promo"]')).toContainText('خصم الشتاء');
});

test('حذف بلوك مضاف: بيتشال هو بس بعد تأكيد', async ({ page }) => {
  const promo = std('block:p1', 7, { kind: 'promo', title_ar: 'إعلان', config: { tone: 'light' } });
  const { writes, state } = await setUp(page, [...seedWeb(), promo, ...seedApp()]);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'حذف رف إعلان' }).click();
  await expect.poll(() => writes.filter((w) => w.method === 'DELETE').length).toBe(1);
  expect(state.some((r) => r.section_key === 'block:p1')).toBe(false);
  expect(state.filter((r) => r.channel === 'web')).toHaveLength(7);
});

test('نسخ الترتيب للتطبيق: نفس الأقسام بنفس الترتيب في طلب واحد، والرفوف القديمة اللي مش في الترتيب بتتشال', async ({ page }) => {
  const web = [
    std('offers', 0, { title_ar: 'عروض الموقع', item_limit: 6 }),
    std('block:p1', 1, { kind: 'promo', title_ar: 'خصم', countries: ['EG'], devices: 'mobile', config: { tone: 'brand' } }),
    ...seedWeb().filter((r) => r.section_key !== 'offers').map((r, i) => ({ ...r, sort_order: i + 2 })),
  ];
  const app = [...seedApp(), std('shelf:old', 20, { kind: 'category-shelf', node_id: 'c2' }, 'app')];
  const { writes, state } = await setUp(page, [...web, ...app]);

  let message = '';
  page.once('dialog', (d) => { message = d.message(); void d.accept(); });
  await page.getByTestId('copy-layout').click();
  await expect.poll(() => writes.filter((w) => w.method === 'RPC').length).toBe(1);
  expect(message).toContain('التطبيق');
  expect(message).toContain('1 عنصر');
  const call = writes.find((w) => w.method === 'RPC')!.body;
  expect(call.p_channel).toBe('app');
  expect(call.p_remove).toEqual(['shelf:old']);
  expect((call.p_rows as Row[]).slice(0, 3).map((r) => r.section_key)).toEqual(['offers', 'block:p1', 'departments']);
  // the website-only limits do not go to the app; the app-only e-book card stays
  expect(rowOf(call.p_rows, 'block:p1')).toMatchObject({ countries: null, devices: 'all', title_ar: 'خصم' });
  expect(rowOf(call.p_rows, 'offers')).toMatchObject({ title_ar: 'عروض الموقع', item_limit: 6 });
  expect((call.p_rows as Row[]).some((r) => r.section_key === 'ebook-library')).toBe(true);
  // the website was not touched
  expect(state.filter((r) => r.channel === 'web').map((r) => r.section_key)).toEqual(web.map((r) => r.section_key));

  // the app's own list now follows
  await page.getByTestId('home-channel-app').click();
  await expect(page.locator('[data-kind="promo"]')).toContainText('خصم');
  await expect(page.locator('[data-kind="shelf"]')).toHaveCount(0);
});

test('نسخ الترتيب: لو المستخدم رفض التأكيد مفيش حاجة بتتبعت', async ({ page }) => {
  const { writes } = await setUp(page);
  page.once('dialog', (d) => void d.dismiss());
  await page.getByTestId('copy-layout').click();
  await page.waitForTimeout(400);
  expect(writes).toHaveLength(0);
});
