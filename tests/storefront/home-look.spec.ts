import { test, expect, type Page } from '../fixtures';
import { isTrusted, parsePreviewMessage, sanitizeRows, trustedOrigins } from '../../src/lib/homePreview';



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
const NODES = [
  node({ id: 'ser', type: 'series', name_ar: 'سلسلة الاختبار', slug: 'ser' }),
  node({ id: 'nahw', parent_id: 'ser', name_ar: 'نحو', slug: 'nahw' }),
  node({ id: 'qisas', name_ar: 'قصص', slug: 'qisas', sort_web: 1 }),
];
/** book ids are real uuids (a hand-picked shelf only keeps those) */
const bid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BOOKS = Array.from({ length: 12 }, (_, i) => bid(i + 1));
const link = (product_id: string, node_id: string) => ({ product_id, node_id, is_primary: false, sort_order: 0 });
const LINKS = [...BOOKS.slice(0, 8).map((b) => link(b, 'nahw')), ...BOOKS.slice(8).map((b) => link(b, 'qisas'))];

type Row = {
  section_key: string; kind: string; node_id: string | null; title_ar: string | null; subtitle_ar: string | null; item_limit: number | null;
  visible: boolean; sort_order: number; starts_at?: string | null; ends_at?: string | null; countries?: string[] | null; devices?: string; config?: Record<string, unknown>;
};
const std = (key: string, order: number, over: Partial<Row> = {}): Row => ({ section_key: key, kind: key, node_id: null, title_ar: null, subtitle_ar: null, item_limit: null, visible: true, sort_order: order, ...over });
const promo = (id: string, order: number, over: Partial<Row> = {}): Row => ({
  section_key: `block:${id}`, kind: 'promo', node_id: null, title_ar: `إعلان ${id}`, subtitle_ar: null, item_limit: null, visible: true, sort_order: order, config: { tone: 'light' }, ...over,
});
const picked = (id: string, order: number, ids: string[], over: Partial<Row> = {}): Row => ({
  section_key: `block:${id}`, kind: 'book-shelf', node_id: null, title_ar: `مختارات ${id}`, subtitle_ar: null, item_limit: null, visible: true, sort_order: order,
  config: { product_ids: ids }, ...over,
});
const rule = (id: string, order: number, source: string, over: Partial<Row> = {}): Row => ({
  section_key: `block:${id}`, kind: 'filter-shelf', node_id: null, title_ar: `قاعدة ${id}`, subtitle_ar: null, item_limit: null, visible: true, sort_order: order,
  config: { source }, ...over,
});

async function stub(page: Page, layout: Row[], opts: { country?: 'eg' | 'sa'; digital?: string[] | 'fail' } = {}) {
  await page.addInitScript((id) => localStorage.setItem('daralfath_client_selected_country', id), opts.country ?? 'eg');
  await page.route('**/rest/v1/countries*', (route) => route.fulfill({ json: [
    { id: 'eg', name: 'مصر', code: 'EG', currency: 'EGP', currency_symbol: 'ج.م', is_active: true },
    { id: 'sa', name: 'السعودية', code: 'SA', currency: 'SAR', currency_symbol: 'ر.س', is_active: true },
  ] }));
  await page.route('**/rest/v1/home_layout*', (route) => route.fulfill({ json: layout }));
  await page.route('**/rest/v1/catalog_nodes*', (route) => route.fulfill({ json: NODES }));
  await page.route('**/rest/v1/product_nodes*', (route) => route.fulfill({ json: LINKS }));
  await page.route('**/rest/v1/home_best_sellers*', (route) => route.fulfill({ json: BOOKS.slice(0, 5).map((product_id, i) => ({ product_id, sort_order: i })) }));
  await page.route('**/rest/v1/intro_videos*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/home_feature_boxes*', (route) => route.fulfill({ json: [{ id: 'f1', title: 'ميزة', description: 'وصف', icon_key: 'truck', image_url: null }] }));
  await page.route('**/rest/v1/site_content_settings*', (route) => route.fulfill({ json: [{ all_books_in_bar: true, intro_videos_title: null }] }));
  await page.route('**/rest/v1/product_variants_public*', (route) => {
    if (opts.digital === 'fail') return route.fulfill({ status: 500, json: { message: 'down' } });
    const digital = new Set(opts.digital ?? []);
    return route.fulfill({
      json: BOOKS.map((product_id, i) => ({
        variant_id: `v${i}`, product_id, is_available: true, is_digital: digital.has(product_id), price: 40, country_code: 'EG', currency_symbol: 'ج.م', variant_name: 'نسخة',
      })),
    });
  });
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: BOOKS.map((product_id, i) => ({
        product_id, title: `كتاب ${String(i + 1).padStart(2, '0')}`, author: 'مؤلف', category_slug: 'nahw', category_name: 'نحو', type: 'ورقي',
        country_code: 'EG', min_price: 40, max_price: 50, starting_price: 40, max_discount_pct: i < 5 ? 20 : 0, old_price: 50, created_at: `2026-0${(i % 9) + 1}-01T00:00:00Z`, images: [],
      })),
    }));
}

const STANDARD = ['departments', 'best-sellers', 'new-arrivals', 'offers', 'categories', 'intro-videos', 'features'];
/** the standard blocks switched off, so only what a test adds is drawn (they are re-added visible if missing) */
const quiet = () => STANDARD.map((key, i) => std(key, 100 + i, { visible: false }));
const rail = (page: Page, testId: string) => page.getByTestId(testId).locator('.shelf-rail__item');


/** the seven standard blocks, switched off except the ones named */
const only = (keep: string[], over: Record<string, Partial<Row>> = {}) =>
  STANDARD.map((key, i) => std(key, i, { visible: keep.includes(key), ...(over[key] ?? {}) }));
const dividers = (page: Page) => page.locator('.page-sections--home > .ornament-divider');

test('شبكة: الرف بيعرض كل كتبه في شبكة بدل الصف اللي بيتحرك، وباقي الرفوف زي ما هي', async ({ page }) => {
  await stub(page, only(['best-sellers', 'new-arrivals'], { 'best-sellers': { config: { look: { layout: 'grid' } } }, 'new-arrivals': { item_limit: 4 } }));
  await page.goto('/');
  const best = page.getByTestId('best-sellers');
  await expect(best).toBeVisible({ timeout: 20_000 });
  await expect(best.getByTestId('shelf-grid').locator('.shelf-grid__item')).toHaveCount(5);
  await expect(best.locator('.shelf-rail__item')).toHaveCount(0);
  await expect(page.getByTestId('new-arrivals').locator('.shelf-rail__item')).toHaveCount(4);
  await expect(page.getByTestId('new-arrivals').getByTestId('shelf-grid')).toHaveCount(0);
});

test('الخلفية: هادية ونعناعي بتتحط على الرف، ومن غير خلفية مفيش', async ({ page }) => {
  await stub(page, only(['best-sellers', 'new-arrivals', 'features'], {
    'best-sellers': { config: { look: { background: 'soft' } } },
    'new-arrivals': { config: { look: { background: 'mint' } } },
  }));
  await page.goto('/');
  await expect(page.getByTestId('best-sellers')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('best-sellers')).toHaveClass(/home-band--soft/);
  await expect(page.getByTestId('new-arrivals')).toHaveClass(/home-band--mint/);
  await expect(page.getByTestId('feature-boxes')).toBeVisible();
  await expect(page.locator('.features-section')).not.toHaveClass(/home-band/);
});

test('الزخرفة: «من غير زخرفة فوقه» بتشيل الفاصل اللي فوق البلوك ده بس', async ({ page }) => {
  await stub(page, only(['best-sellers', 'new-arrivals', 'offers']));
  await page.goto('/');
  await expect(page.getByTestId('offers')).toBeVisible({ timeout: 20_000 });
  const before = await dividers(page).count();
  expect(before).toBe(2);
  await page.unroute('**/rest/v1/home_layout*');
  await page.route('**/rest/v1/home_layout*', (route) => route.fulfill({ json: only(['best-sellers', 'new-arrivals', 'offers'], { offers: { config: { look: { divider: 'none' } } } }) }));
  await page.reload();
  await expect(page.getByTestId('offers')).toBeVisible({ timeout: 20_000 });
  await expect(dividers(page)).toHaveCount(1);
});

test('الرابط: كلمة جديدة، وإخفاء، ووجهة تانية (الموقع بيفتح الصفحة المقابلة)، حتى لو الرف ملوش رابط أصلًا', async ({ page }) => {
  await stub(page, only(['best-sellers', 'new-arrivals', 'offers'], {
    'new-arrivals': { config: { look: { link_label: 'شوف كل الجديد' } } },
    offers: { config: { look: { link_hidden: true } } },
    'best-sellers': { config: { look: { link_url: '/search?sort=newest', link_label: 'الأكثر طلبًا' } } },
  }));
  await page.goto('/');
  await expect(page.getByTestId('offers')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('new-arrivals').getByRole('link', { name: 'شوف كل الجديد' })).toHaveAttribute('href', '/books?sort=newest');
  await expect(page.getByTestId('offers').locator('.section-heading a')).toHaveCount(0);
  // the best-sellers row has no link of its own; the owner gave it one
  await expect(page.getByTestId('best-sellers').getByRole('link', { name: 'الأكثر طلبًا' })).toHaveAttribute('href', '/books?sort=newest');
});

test('الرابط: وجهة مالهاش صفحة في الموقع بترجع لرابط الرف الأصلي، وصفوف التصنيفات التلقائية بتاخد الكلمة بس', async ({ page }) => {
  await stub(page, only(['new-arrivals', 'categories'], {
    'new-arrivals': { config: { look: { link_url: '/ebooks' } } },
    categories: { item_limit: 2, config: { look: { link_label: 'تصفح التصنيف', link_url: '/search' } } },
  }));
  await page.goto('/');
  await expect(page.getByTestId('new-arrivals')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('new-arrivals').getByRole('link', { name: 'عرض الكل' })).toHaveAttribute('href', '/books?sort=newest');
  const auto = page.locator('.shelf-section[data-block-key="categories"]');
  await expect(auto.first().getByRole('link', { name: 'تصفح التصنيف' })).toHaveAttribute('href', /\/books\?category=/);
});

test('رف مختار ورف كتب مختارة بياخدوا الشكل كمان، وشريط الإعلان بياخد الزخرفة', async ({ page }) => {
  await stub(page, [
    picked('a', 0, [BOOKS[0], BOOKS[1], BOOKS[2]], { config: { product_ids: [BOOKS[0], BOOKS[1], BOOKS[2]], look: { layout: 'grid', background: 'soft', link_url: '/search', link_label: 'كل الكتب' } } }),
    promo('p', 1, { config: { tone: 'light', look: { divider: 'none' } } }),
    ...only([]),
  ]);
  await page.goto('/');
  const shelf = page.getByTestId('custom-book-shelf');
  await expect(shelf).toBeVisible({ timeout: 20_000 });
  await expect(shelf.locator('.shelf-grid__item')).toHaveCount(3);
  await expect(shelf).toHaveClass(/home-band--soft/);
  await expect(shelf.getByRole('link', { name: 'كل الكتب' })).toHaveAttribute('href', '/books');
  await expect(dividers(page)).toHaveCount(0); // the promo strip asked for no divider above it
});

// ─── the dashboard's preview ───────────────────────────────────────────────────────────────────────────────────────────────

const post = (page: Page, message: unknown) => page.evaluate((m) => window.postMessage(m, window.location.origin), message);

test('معاينة: الصفحة بتاخد الصفوف اللي بتتبعت ليها بدل المحفوظة، وبتتجاهل الرسايل لو مش في وضع المعاينة', async ({ page }) => {
  await stub(page, only(['best-sellers']));
  await page.goto('/');
  await expect(page.getByTestId('best-sellers')).toBeVisible({ timeout: 20_000 });
  // an ordinary page ignores the message
  await post(page, { type: 'daralfath:home-preview', rows: [promo('x', 0), ...only([])], now: null, country: null, scrollTo: null });
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading', { name: 'إعلان x' })).toHaveCount(0);

  await page.goto('/?preview=home');
  await expect(page.getByTestId('best-sellers')).toBeVisible({ timeout: 20_000 });
  await post(page, { type: 'daralfath:home-preview', rows: [promo('x', 0), ...only([])], now: null, country: null, scrollTo: null });
  await expect(page.getByRole('heading', { name: 'إعلان x' })).toBeVisible();
  await expect(page.getByTestId('best-sellers')).toHaveCount(0);
  // a later message replaces the rows again
  await post(page, { type: 'daralfath:home-preview', rows: only(['best-sellers']), now: null, country: null, scrollTo: null });
  await expect(page.getByTestId('best-sellers')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إعلان x' })).toHaveCount(0);
});

test('معاينة بتاريخ ودولة تانيين: البلوك المجدول بيظهر في ميعاده، وبلوك السعودية بيظهر لما نختار السعودية', async ({ page }) => {
  const rows = [
    promo('future', 0, { starts_at: '2999-01-01T00:00:00Z' }),
    promo('sa', 1, { countries: ['SA'] }),
    promo('open', 2),
    ...only([]),
  ];
  await stub(page, rows);
  await page.goto('/?preview=home');
  await expect(page.getByRole('heading', { name: 'إعلان open' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'إعلان future' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'إعلان sa' })).toHaveCount(0);
  await post(page, { type: 'daralfath:home-preview', rows, now: '3000-01-01T00:00:00Z', country: 'SA', scrollTo: null });
  await expect(page.getByRole('heading', { name: 'إعلان future' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إعلان sa' })).toBeVisible();
  // back to «now» and the visitor's own country
  await post(page, { type: 'daralfath:home-preview', rows, now: null, country: null, scrollTo: null });
  await expect(page.getByRole('heading', { name: 'إعلان future' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'إعلان sa' })).toHaveCount(0);
  // the preview never changes the visitor's saved country
  expect(await page.evaluate(() => localStorage.getItem('daralfath_client_selected_country'))).toBe('eg');
});

test('معاينة: الروابط مبتفتحش (الصفحة تفضل في مكانها)، والتمرير لبلوك معيّن بيشتغل', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  const rows = [picked('top', 0, [BOOKS[0]]), promo('far', 1, { title_ar: 'إعلان بعيد' }), ...only(['best-sellers', 'new-arrivals', 'offers'])];
  await stub(page, rows);
  await page.goto('/?preview=home');
  await expect(page.getByRole('heading', { name: 'إعلان بعيد' })).toBeAttached({ timeout: 20_000 });
  const start = page.url();
  await page.locator('.shelf-section a[href]').first().click({ force: true });
  await page.waitForTimeout(300);
  expect(page.url()).toBe(start);

  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await post(page, { type: 'daralfath:home-preview', rows, now: null, country: null, scrollTo: 'block:offers-never' });
  await post(page, { type: 'daralfath:home-preview', rows, now: null, country: null, scrollTo: 'offers' });
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeGreaterThan(200);
  await expect(page.locator('[data-block-key="offers"]')).toBeInViewport();
});

test('معاينة داخل إطار: الصفحة بتقول إنها جاهزة للصفحة اللي فتحتها، وبتاخد الصفوف منها', async ({ page }) => {
  await stub(page, only(['best-sellers']));
  await page.route('**/__parent.html', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body><iframe id="f" src="/?preview=home" style="width:1100px;height:800px;border:0"></iframe><script>
      window.__msgs = [];
      window.addEventListener('message', (e) => { window.__msgs.push({ origin: e.origin, type: e.data && e.data.type }); });
    </script></body></html>`,
  }));
  await page.goto('/__parent.html');
  await expect.poll(() => page.evaluate(() => (window as any).__msgs.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).__msgs[0])).toEqual({ origin: new URL(page.url()).origin, type: 'daralfath:home-preview-ready' });
  await page.evaluate((m) => (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(m, '*'), { type: 'daralfath:home-preview', rows: [promo('z', 0), ...only([])], now: null, country: null, scrollTo: null });
  await expect(page.frameLocator('#f').getByRole('heading', { name: 'إعلان z' })).toBeVisible({ timeout: 10_000 });
});

test('أمان المعاينة: الأصل الموثوق هو لوحة التحكم بس (وفي التطوير المحلي)، والرسالة الغريبة بتتنضّف', async () => {
  const prod = trustedOrigins(false, 'https://darolfath.com');
  expect(prod).toEqual(['https://dar-alfath-dashboard.vercel.app']);
  expect(isTrusted('https://dar-alfath-dashboard.vercel.app', false, 'https://darolfath.com')).toBe(true);
  expect(isTrusted('https://darolfath.com', false, 'https://darolfath.com')).toBe(false);
  expect(isTrusted('https://evil.example', false, 'https://darolfath.com')).toBe(false);
  expect(isTrusted('http://127.0.0.1:8080', false, 'https://darolfath.com')).toBe(false);
  expect(isTrusted('http://127.0.0.1:8080', true, 'http://127.0.0.1:5173')).toBe(true);

  expect(parsePreviewMessage(null)).toBeNull();
  expect(parsePreviewMessage({ type: 'other' })).toBeNull();
  expect(parsePreviewMessage('x')).toBeNull();
  const message = parsePreviewMessage({ type: 'daralfath:home-preview', rows: [], now: 'garbage', country: 'egypt', scrollTo: 5 })!;
  expect(message).toMatchObject({ rows: [], now: null, country: null, scrollTo: null });
  expect(parsePreviewMessage({ type: 'daralfath:home-preview', rows: [], now: '2026-12-10T00:00:00Z', country: 'sa', scrollTo: 'block:a' })).toMatchObject({ country: 'SA', scrollTo: 'block:a' });
  // rows: only well-formed ones, bad fields neutralised, no more than a page could hold
  expect(sanitizeRows('nope')).toBeNull();
  expect(sanitizeRows(Array.from({ length: 81 }, () => ({})))).toBeNull();
  const rows = sanitizeRows([
    { section_key: 'offers', kind: 'offers', title_ar: 5, item_limit: 2.5, visible: 'yes', sort_order: 'x', countries: ['eg', 7, 'sauce'], devices: 3, config: [1] },
    { kind: 'no key' }, null, 'text',
    { section_key: 'block:a', kind: 'promo', title_ar: 'x'.repeat(900), config: { look: { layout: 'grid' } } },
  ])!;
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ title_ar: null, item_limit: null, visible: true, sort_order: 0, countries: ['eg', 'sa'], devices: null, config: {} });
  expect(rows[1].title_ar).toHaveLength(500);
  expect(rows[1].config).toEqual({ look: { layout: 'grid' } });
});
