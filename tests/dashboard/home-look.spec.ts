import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// (copy of the setup of home-controls.spec.ts) «الصفحة الرئيسية» in the catalog hub, the extra controls: every block can be scheduled (from / until), limited to countries
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


/** The website's preview page, stood in for by a tiny page that says it is ready and keeps what it is sent. */
const PREVIEW_PAGE = `<!doctype html><html><body><p>preview</p><script>
  window.__msgs = [];
  window.addEventListener('message', function (e) { window.__msgs.push(e.data); });
  parent.postMessage({ type: 'daralfath:home-preview-ready' }, '*');
</script></body></html>`;
const SILENT_PAGE = '<!doctype html><html><body><p>silent</p></body></html>';

async function stubPreview(page: Page, html = PREVIEW_PAGE) {
  await page.route('https://darolfath.com/store/**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
}
const messages = (page: Page) => page.frameLocator('[data-testid="preview-frame"]').locator('body').evaluate(() => (window as any).__msgs as any[]);
const lastMessage = async (page: Page) => { const all = await messages(page); return all[all.length - 1]; };
const rowIn = (message: any, key: string) => (message.rows as Row[]).find((r) => r.section_key === key)!;

test('الشكل: كل بلوك ليه الخيارات اللي تناسبه بس', async ({ page }) => {
  await setUp(page);
  const open = async (name: RegExp) => { await page.getByRole('button', { name }).click(); await expect(page.getByTestId('shelf-form')).toBeVisible(); };
  const close = () => page.getByRole('button', { name: 'إلغاء' }).click();

  await open(/^تعديل الأكثر مبيعًا/);
  for (const id of ['look-layout', 'look-background', 'look-divider', 'look-link-label']) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('look-link-destination')).toBeVisible();
  await close();

  await open(/^تعديل السلاسل/);
  await expect(page.getByTestId('block-look')).toHaveCount(0); // the series strip keeps its own tight place
  await close();

  await open(/^تعديل مربعات المزايا/);
  await expect(page.getByTestId('look-background')).toBeVisible();
  await expect(page.getByTestId('look-divider')).toBeVisible();
  await expect(page.getByTestId('look-layout')).toHaveCount(0);
  await expect(page.getByTestId('look-link')).toHaveCount(0);
  await close();

  await open(/^تعديل صفوف التصنيفات/);
  await expect(page.getByTestId('look-layout')).toBeVisible();
  await expect(page.getByTestId('look-link-label')).toBeVisible();
  await expect(page.getByTestId('look-link-destination')).toHaveCount(0); // every automatic shelf opens its own category
  await close();

  await page.getByTestId('add-promo').click();
  await expect(page.getByTestId('look-divider')).toBeVisible();
  await expect(page.getByTestId('look-layout')).toHaveCount(0);
  await expect(page.getByTestId('look-background')).toHaveCount(0);
});

test('التطبيق: من غير خيار الزخرفة (التطبيق ملوش فواصل)', async ({ page }) => {
  await setUp(page, undefined, '/catalog?tab=home&channel=app');
  await page.getByRole('button', { name: /^تعديل وصل حديثًا/ }).click();
  await expect(page.getByTestId('look-layout')).toBeVisible();
  await expect(page.getByTestId('look-background')).toBeVisible();
  await expect(page.getByTestId('look-divider')).toHaveCount(0);
});

test('حفظ الشكل: بيتكتب في config.look بالقيم اللي اتغيّرت بس، وبيظهر عليه علامة «شكل مخصص»', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.getByRole('button', { name: /^تعديل الأكثر مبيعًا/ }).click();
  await page.getByTestId('look-layout').selectOption('grid');
  await page.getByTestId('look-background').selectOption('mint');
  await page.getByTestId('look-divider').selectOption('none');
  await page.getByTestId('look-link-label').fill('شوف الكل');
  const dest = page.getByTestId('look-link-destination');
  await dest.getByLabel('نوع الوجهة').selectOption('static');
  await dest.getByLabel('الصفحة', { exact: true }).selectOption('/search?sort=newest');
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(rowOf(lastPost(writes), 'best-sellers').config).toEqual({
    look: { layout: 'grid', background: 'mint', divider: 'none', link_label: 'شوف الكل', link_url: '/search?sort=newest' },
  });
  // the other blocks keep an empty config
  expect(rowOf(lastPost(writes), 'features').config).toEqual({});
  await expect(page.getByTestId('home-block-best-sellers').getByTestId('look-badge')).toBeVisible();
  await expect(page.getByTestId('home-block-offers').getByTestId('look-badge')).toHaveCount(0);
});

test('إخفاء الرابط: كلمته ووجهته بتختفي من الفورم، واتحفظ link_hidden، والرجوع للشكل العادي بيمسح look', async ({ page }) => {
  const seeded = seedWeb().map((r) => (r.section_key === 'offers' ? { ...r, config: { look: { layout: 'grid', background: 'soft', link_label: 'قديمة' } } } : r));
  const { writes } = await setUp(page, [...seeded, ...seedApp()]);
  await expect(page.getByTestId('home-block-offers').getByTestId('look-badge')).toBeVisible();
  await page.getByRole('button', { name: /^تعديل عروض وخصومات/ }).click();
  await expect(page.getByTestId('look-layout')).toHaveValue('grid');
  await expect(page.getByTestId('look-link-label')).toHaveValue('قديمة');
  await page.getByTestId('look-link-hidden').check();
  await expect(page.getByTestId('look-link-label')).toHaveCount(0);
  await expect(page.getByTestId('look-link-destination')).toHaveCount(0);
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(rowOf(lastPost(writes), 'offers').config).toEqual({ look: { layout: 'grid', background: 'soft', link_hidden: true } });

  // back to the standard look: nothing is kept
  await page.getByRole('button', { name: /^تعديل عروض وخصومات/ }).click();
  await page.getByTestId('look-layout').selectOption('rail');
  await page.getByTestId('look-background').selectOption('none');
  await page.getByTestId('look-link-hidden').uncheck();
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(rowOf(lastPost(writes), 'offers').config).toEqual({});
  await expect(page.getByTestId('home-block-offers').getByTestId('look-badge')).toHaveCount(0);
});

test('رف مضاف بيحتفظ بإعداداته الخاصة جنب الشكل', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.getByTestId('add-filter-shelf').click();
  await page.getByTestId('filter-source').selectOption('ebooks');
  await page.getByTestId('look-layout').selectOption('grid');
  await page.getByTestId('shelf-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(lastPost(writes).find((r) => r.kind === 'filter-shelf')!.config).toEqual({ source: 'ebooks', look: { layout: 'grid' } });
});

test('معاينة الموقع: بتتفتح وبتفتكر، الإطار بيقول جاهز، والصفوف بتتبعت (حتى اللي لسه مش محفوظ)', async ({ page }) => {
  await stubPreview(page);
  const { writes } = await setUp(page);
  await expect(page.getByTestId('home-preview')).toHaveCount(0);
  await page.getByTestId('preview-toggle').click();
  await expect(page.getByTestId('home-preview')).toBeVisible();
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('src', 'https://darolfath.com/store/?preview=home');
  await expect(page.getByTestId('preview-loading')).toHaveCount(0);

  // the saved rows reach the page
  await expect.poll(async () => (await lastMessage(page))?.rows?.length).toBe(7);
  const first = await lastMessage(page);
  expect(first).toMatchObject({ type: 'daralfath:home-preview', now: null, country: null, scrollTo: null });
  expect((first.rows as Row[]).map((r) => r.section_key)).toEqual(STANDARD);

  // an edit that is not saved yet is seen in the preview, and the page is told to scroll to it
  await page.getByRole('button', { name: /^تعديل وصل حديثًا/ }).click();
  await page.getByTestId('shelf-title').fill('جديدنا قوي');
  await page.getByTestId('look-layout').selectOption('grid');
  await expect.poll(async () => rowIn(await lastMessage(page), 'new-arrivals').title_ar).toBe('جديدنا قوي');
  const edited = await lastMessage(page);
  expect(rowIn(edited, 'new-arrivals').config).toEqual({ look: { layout: 'grid' } });
  expect(edited.scrollTo).toBe('new-arrivals');
  expect(writes).toHaveLength(0);

  // a new block that is only a draft appears at the end
  await page.getByRole('button', { name: 'إلغاء' }).click();
  await page.getByTestId('add-promo').click();
  await page.getByTestId('shelf-title').fill('إعلان جديد');
  await expect.poll(async () => (await lastMessage(page)).rows.length).toBe(8);
  const added = await lastMessage(page);
  expect((added.rows as Row[]).at(-1)).toMatchObject({ kind: 'promo', title_ar: 'إعلان جديد' });
  expect(writes).toHaveLength(0);

  // remembered after a reload
  await page.reload();
  await expect(page.getByTestId('home-preview')).toBeVisible({ timeout: 20_000 });
});

test('معاينة الموقع: الدولة والتاريخ والحجم', async ({ page }) => {
  await stubPreview(page);
  await setUp(page);
  await page.getByTestId('preview-toggle').click();
  await expect.poll(async () => (await lastMessage(page))?.rows?.length).toBe(7);
  await page.getByTestId('preview-country').selectOption('SA');
  await expect.poll(async () => (await lastMessage(page)).country).toBe('SA');
  await page.getByTestId('preview-at').fill('2099-12-01T09:00');
  await expect.poll(async () => (await lastMessage(page)).now).toBe(await localIso(page, 2099, 12, 1, 9, 0));
  await page.getByTestId('preview-now').click();
  await expect.poll(async () => (await lastMessage(page)).now).toBeNull();

  const width = () => page.getByTestId('preview-frame').evaluate((el) => (el as HTMLIFrameElement).style.width);
  expect(await width()).toBe('390px');
  await page.getByTestId('preview-desktop').click();
  expect(await width()).toBe('1280px');
  await page.getByTestId('preview-mobile').click();
  expect(await width()).toBe('390px');
});

test('معاينة الموقع: لو الصفحة ما ردّتش بعد وقت، بتتقال الحقيقة وفيه زرار نافذة مستقلة', async ({ page }) => {
  await page.clock.install();
  await stubPreview(page, SILENT_PAGE);
  await setUp(page);
  await page.getByTestId('preview-toggle').click();
  await expect(page.getByTestId('preview-loading')).toBeVisible();
  await expect(page.getByTestId('preview-failed')).toHaveCount(0);
  await page.clock.fastForward(10_000);
  await expect(page.getByTestId('preview-failed')).toBeVisible();
  await expect(page.getByTestId('preview-popup')).toBeVisible();
});

test('معاينة التطبيق: رسمة تقريبية بنفس الترتيب، والمخفي والمنتهي معلّم، والتاريخ بيغيّرها', async ({ page }) => {
  const app = seedApp().map((r) => {
    if (r.section_key === 'offers') return { ...r, visible: false };
    if (r.section_key === 'best-sellers') return { ...r, config: { look: { layout: 'grid', background: 'mint', link_label: 'كل الكتب' } } };
    if (r.section_key === 'new-arrivals') return { ...r, starts_at: '2999-01-01T00:00:00Z' };
    return r;
  });
  await setUp(page, [...seedWeb(), ...app], '/catalog?tab=home&channel=app');
  await page.getByTestId('preview-toggle').click();
  const sketch = page.getByTestId('app-sketch');
  await expect(sketch).toBeVisible();
  await expect(page.getByTestId('home-preview')).toHaveAttribute('data-channel', 'app');
  await expect(page.getByTestId('preview-frame')).toHaveCount(0);
  // order: the blocks that show, then the ones that don't, each marked
  await expect(sketch.getByTestId('sketch-block').first()).toHaveAttribute('data-key', 'departments');
  const hidden = sketch.getByTestId('sketch-hidden');
  await expect(hidden.filter({ hasText: 'مقفول' })).toHaveCount(1);
  await expect(hidden.filter({ hasText: 'لسه ما بدأش' })).toHaveCount(1);
  // the look shows: a band and the owner's link words
  const best = sketch.locator('[data-key="best-sellers"]');
  await expect(best).toHaveClass(/bg-emerald-50/);
  await expect(best).toContainText('كل الكتب');
  // looking at it after the start date brings the block in
  await page.getByTestId('preview-at').fill('3000-01-01T00:00');
  await expect(sketch.locator('[data-key="new-arrivals"][data-testid="sketch-block"]')).toBeVisible();
  await expect(hidden.filter({ hasText: 'لسه ما بدأش' })).toHaveCount(0);
});
