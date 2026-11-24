import { test, expect, type Page } from '../fixtures';

// The top of a section's / series' page as the dashboard's «صفحات الأقسام» sets it: a video or a picture, the welcome text, and how
// the text is set (right / centre / left, its size, the space at its sides, above / below / beside the picture or video). The
// dashboard's unsaved page arrives by message in the preview. Answered by the test; nothing is written.

const NOW = '2026-01-01T00:00:00Z';
const SER = '77777777-7777-4777-8777-777777777777';
const SEC = '88888888-8888-4888-8888-888888888888';
const node = (over: Record<string, unknown>) => ({
  id: SER, parent_id: null, type: 'series', name_ar: 'سلسلة الاختبار', name_en: null, slug: 'ser', description_ar: null, description_en: null, image_url: null, icon: null, color: null,
  is_active: true, featured: false, show_web: true, show_app: true, sort_web: 0, sort_app: 0, show_in_menu_web: true, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
  books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null,
  intro_ar: 'أهلًا بك في السلسلة.\n\nفقرة ثانية.', intro_en: null, video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  intro_media: 'auto', intro_image_url: null, intro_align: 'right', intro_font_px: 16, intro_pad_right: 0, intro_pad_left: 0, intro_text_pos: 'side',
  page_layout: 'grid', strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null, created_at: NOW, updated_at: NOW, ...over,
});

async function stub(page: Page, over: Record<string, unknown> = {}) {
  const nodes = [node(over), node({ id: SEC, type: 'section', name_ar: 'قسم الاختبار', slug: 'sec', ...over })];
  await page.route('**/rest/v1/catalog_nodes*', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: nodes })));
  await page.route('**/rest/v1/product_nodes*', (route) =>
    route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: [SER, SEC].map((node_id) => ({ product_id: 'b1', node_id, is_primary: false, sort_order: 0 })) }));
  await page.route('**/rest/v1/menu_items*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/store_departments*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: [{ product_id: 'b1', title: 'كتاب', author: 'مؤلف', category_slug: 'x', category_name: 'x', country_code: 'EG', min_price: 50, max_price: 50, starting_price: 50, images: [] }],
    }));
  await page.route('**/i.ytimg.com/**', (route) => route.fulfill({ status: 204 }));
}

const hero = (page: Page) => page.getByTestId('node-hero');
const text = (page: Page) => page.getByTestId('node-hero-text');
const send = (page: Page, message: Record<string, unknown>) => page.evaluate((m) => window.postMessage({ type: 'daralfath:display-preview', ...m }, window.location.origin), message);
/** which comes first inside the hero: its text or its picture / video */
const order = (page: Page) => hero(page).evaluate((el) => [...el.children].map((c) => (c.getAttribute('data-testid') === 'node-hero-text' ? 'text' : 'media')));

test('الشكل القديم: من غير إعدادات، النص جنب الفيديو زي ما كان', async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/books?series=${SER}`);
  await expect(hero(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('node-video')).toBeVisible();
  await expect(hero(page)).toHaveClass(/node-hero--with-media/);
  await expect(hero(page)).not.toHaveClass(/node-hero--stack/);
  expect(await order(page)).toEqual(['text', 'media']);
  await expect(text(page)).toHaveAttribute('data-align', 'right');
  await expect(text(page).locator('.node-hero__intro').first()).toHaveCSS('font-size', '16px');
});

test('مكان الكلام: فوق الفيديو أو تحته، في عمود واحد', async ({ page }) => {
  await stub(page, { intro_text_pos: 'above' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/books?series=${SER}`);
  await expect(hero(page)).toBeVisible({ timeout: 20_000 });
  await expect(hero(page)).toHaveClass(/node-hero--stack/);
  expect(await order(page)).toEqual(['text', 'media']);
  const [t, m] = await Promise.all([text(page).boundingBox(), page.getByTestId('node-video').boundingBox()]);
  expect(t!.y + t!.height).toBeLessThanOrEqual(m!.y + 1);
});

test('مكان الكلام تحت: الفيديو الأول', async ({ page }) => {
  await stub(page, { intro_text_pos: 'below' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/books?series=${SER}`);
  await expect(hero(page)).toBeVisible({ timeout: 20_000 });
  expect(await order(page)).toEqual(['media', 'text']);
  const [t, m] = await Promise.all([text(page).boundingBox(), page.getByTestId('node-video').boundingBox()]);
  expect(m!.y + m!.height).toBeLessThanOrEqual(t!.y + 1);
});

test('صورة بدل الفيديو: بتظهر، والفيديو مبيظهرش', async ({ page }) => {
  await page.route('https://img.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#2aa3ab"/></svg>' }));
  await stub(page, { intro_media: 'image', intro_image_url: 'https://img.test/hero.svg' });
  await page.goto(`/books?series=${SER}`);
  await expect(hero(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('node-image').locator('img')).toHaveAttribute('src', 'https://img.test/hero.svg');
  await expect(page.getByTestId('node-video')).toHaveCount(0);
});

test('اختيار «بدون»: لا فيديو ولا صورة، والكلام لوحده', async ({ page }) => {
  await stub(page, { intro_media: 'none', intro_image_url: 'https://img.test/hero.svg' });
  await page.goto(`/books?series=${SER}`);
  await expect(hero(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('node-video')).toHaveCount(0);
  await expect(page.getByTestId('node-image')).toHaveCount(0);
  await expect(text(page).getByText('أهلًا بك في السلسلة.')).toBeVisible();
  expect(await order(page)).toEqual(['text']);
});

test('عنوان صورة مش https مبيتعرضش', async ({ page }) => {
  await stub(page, { intro_media: 'image', intro_image_url: 'javascript:alert(1)', video_url: null });
  await page.goto(`/books?series=${SER}`);
  await expect(hero(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('node-image')).toHaveCount(0);
});

test('تنسيق الكلام: المحاذاة والحجم والمسافات من اليمين والشمال', async ({ page }) => {
  await stub(page, { video_url: null, intro_align: 'center', intro_font_px: 24, intro_pad_right: 40, intro_pad_left: 10 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/books?series=${SER}`);
  await expect(hero(page)).toBeVisible({ timeout: 20_000 });
  await expect(text(page)).toHaveAttribute('data-align', 'center');
  await expect(text(page)).toHaveCSS('text-align', 'center');
  await expect(text(page).locator('.node-hero__intro').first()).toHaveCSS('font-size', '24px');
  await expect(text(page).locator('.node-hero__intro').first()).toHaveCSS('text-align', 'center');
  await expect(text(page)).toHaveCSS('padding-right', '40px');
  await expect(text(page)).toHaveCSS('padding-left', '10px');
});

test('قيم غريبة: بترجع للشكل العادي', async ({ page }) => {
  await stub(page, { video_url: null, intro_align: 'justify', intro_font_px: 5000, intro_pad_right: -30, intro_text_pos: 'diagonal' });
  await page.goto(`/books?series=${SER}`);
  await expect(hero(page)).toBeVisible({ timeout: 20_000 });
  await expect(text(page)).toHaveAttribute('data-align', 'right');
  await expect(text(page).locator('.node-hero__intro').first()).toHaveCSS('font-size', '40px');
  await expect(text(page)).toHaveCSS('padding-right', '0px');
});

test('صفحة قسم (مش سلسلة) بتاخد نفس الشكل', async ({ page }) => {
  await stub(page, { video_url: null, intro_align: 'left', intro_text_pos: 'above' });
  await page.goto(`/books?node=${SEC}`);
  await expect(hero(page)).toBeVisible({ timeout: 20_000 });
  await expect(text(page)).toHaveAttribute('data-align', 'left');
  await expect(text(page)).toHaveCSS('text-align', 'left');
});

test('المعاينة: مسودة صفحة القسم بتتحط فوق المحفوظ، وبترجع', async ({ page }) => {
  await stub(page, { video_url: null, intro_ar: 'النص المحفوظ' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/books?series=${SER}&preview=display`);
  await expect(text(page).getByText('النص المحفوظ')).toBeVisible({ timeout: 20_000 });

  await send(page, { nodePage: { id: SER, fields: { intro_ar: 'نص من المسودة', intro_align: 'center', intro_font_px: 28, intro_pad_right: 60, video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', intro_media: 'video', intro_text_pos: 'below' } } });
  await expect(text(page).getByText('نص من المسودة')).toBeVisible();
  await expect(text(page)).toHaveAttribute('data-align', 'center');
  await expect(text(page).locator('.node-hero__intro').first()).toHaveCSS('font-size', '28px');
  await expect(page.getByTestId('node-video')).toBeVisible();
  expect(await order(page)).toEqual(['media', 'text']);

  // a draft for another page is ignored, and null goes back to the saved page
  await send(page, { nodePage: { id: SEC, fields: { intro_ar: 'مش ليك' } } });
  await expect(text(page).getByText('نص من المسودة')).toHaveCount(0);
  await send(page, { nodePage: null });
  await expect(text(page).getByText('النص المحفوظ')).toBeVisible();
  await expect(page.getByTestId('node-video')).toHaveCount(0);
});

test('المعاينة: صفحة من غير ميديا ولا كلام محفوظ بتظهر لما المسودة فيها كلام', async ({ page }) => {
  await stub(page, { video_url: null, intro_ar: null });
  await page.goto(`/books?series=${SER}&preview=display`);
  await expect(page.getByRole('heading', { level: 1, name: 'سلسلة الاختبار' })).toBeVisible({ timeout: 20_000 });
  await send(page, { nodePage: { id: SER, fields: { intro_ar: 'كلام لسه ما اتحفظش' } } });
  await expect(text(page).getByText('كلام لسه ما اتحفظش')).toBeVisible();
});
