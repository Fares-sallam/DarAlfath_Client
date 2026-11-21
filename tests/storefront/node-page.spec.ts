import { test, expect, type Page } from '../fixtures';

// A series / section page as the dashboard's «السلاسل والتصنيفات» sets it up: the name, a welcome text and a video on
// top, then one strip of books for each node under it (pulled sideways), then the books no strip holds. The tree is
// answered by the test; nothing is written.

const NOW = '2026-01-01T00:00:00Z';
const node = (over: Record<string, unknown>) => ({
  id: 'x', parent_id: null, type: 'category', name_ar: 'عنصر', name_en: null, slug: 'x',
  description_ar: null, description_en: null, image_url: null, icon: null, color: null,
  is_active: true, featured: false, show_web: true, show_app: true, sort_web: 0, sort_app: 0,
  show_in_menu_web: true, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
  books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null,
  intro_ar: null, intro_en: null, video_url: null, page_layout: 'auto', strips_limit: 20, show_as_strip: true,
  legacy_table: null, legacy_id: null, created_at: NOW, updated_at: NOW, ...over,
});

const BOOKS = Array.from({ length: 22 }, (_, i) => `b${i + 1}`);
const NODES = [
  node({ id: 'sec', type: 'section', name_ar: 'قسم اللغة', slug: 'sec', sort_web: 0 }),
  node({
    id: 'ser', parent_id: 'sec', type: 'series', name_ar: 'سلسلة الاختبار', slug: 'ser', sort_web: 0,
    intro_ar: 'أهلًا بك في السلسلة.\n\nفقرة ثانية عن السلسلة.', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    seo_title: 'عنوان خاص للسلسلة', seo_description: 'وصف خاص للسلسلة',
  }),
  node({ id: 'c-big', parent_id: 'ser', name_ar: 'النحو', slug: 'nahw', sort_web: 0 }),
  node({ id: 'c-small', parent_id: 'ser', name_ar: 'الإملاء', slug: 'imla', sort_web: 1 }),
  node({ id: 'c-empty', parent_id: 'ser', name_ar: 'تصنيف فاضي', slug: 'empty', sort_web: 2 }),
  node({ id: 'c-off', parent_id: 'ser', name_ar: 'مخفي من الأشرطة', slug: 'off', sort_web: 3, show_as_strip: false }),
  node({ id: 'ser-short', type: 'series', name_ar: 'سلسلة قصيرة', slug: 'short', sort_web: 1, strips_limit: 3 }),
  node({ id: 'c-short', parent_id: 'ser-short', name_ar: 'قصص', slug: 'qisas', sort_web: 0 }),
  node({ id: 'ser-grid', type: 'series', name_ar: 'سلسلة شبكة', slug: 'grid', sort_web: 2, page_layout: 'grid', intro_ar: 'نص فوق الشبكة' }),
  node({ id: 'c-under-grid', parent_id: 'ser-grid', name_ar: 'تحت الشبكة', slug: 'ug', sort_web: 0 }),
];
const link = (product_id: string, node_id: string, sort_order = 0) => ({ product_id, node_id, is_primary: false, sort_order });
const LINKS = [
  // 14 in النحو (a strip wider than the screen), 2 in الإملاء, 1 only on the series itself
  ...BOOKS.slice(0, 14).flatMap((b, i) => [link(b, 'c-big', i), link(b, 'ser', i)]),
  ...BOOKS.slice(14, 16).flatMap((b, i) => [link(b, 'c-small', i), link(b, 'ser', 20 + i)]),
  link(BOOKS[16], 'ser', 30),
  // a series with 5 books under one category, its strip limited to 3
  ...BOOKS.slice(0, 5).flatMap((b, i) => [link(b, 'c-short', i), link(b, 'ser-short', i)]),
  // the grid-layout series
  ...BOOKS.slice(17, 20).flatMap((b, i) => [link(b, 'c-under-grid', i), link(b, 'ser-grid', i)]),
];

async function stubTree(page: Page, nodes = NODES, links = LINKS) {
  await page.route('**/rest/v1/catalog_nodes*', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: nodes })));
  await page.route('**/rest/v1/product_nodes*', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: links })));
  await page.route('**/rest/v1/menu_items*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/products_public_catalog*', (route) =>
    route.fulfill({
      json: BOOKS.map((product_id, i) => ({
        product_id, title: `كتاب ${String(i + 1).padStart(2, '0')}`, author: 'مؤلف', category_slug: 'nahw', category_name: 'النحو',
        country_code: 'EG', min_price: 50, max_price: 50, starting_price: 50, images: [],
      })),
    }));
}

const strips = (page: Page) => page.getByTestId('node-strip');

test('صفحة السلسلة: الاسم والنص التعريفي والفيديو فوق، وشريط لكل تصنيف تحتها بترتيب اللوحة', async ({ page }) => {
  await stubTree(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/books?series=ser');

  const hero = page.getByTestId('node-hero');
  await expect(hero.getByRole('heading', { level: 1, name: 'سلسلة الاختبار' })).toBeVisible({ timeout: 20_000 });
  await expect(hero.getByText('أهلًا بك في السلسلة.')).toBeVisible();
  await expect(hero.getByText('فقرة ثانية عن السلسلة.')).toBeVisible();
  await expect(hero.getByText('17 كتاب')).toBeVisible();
  await expect(page.getByTestId('node-video')).toBeVisible();

  // one strip per visible, non-empty node under it, in the dashboard's order, each with its name above
  await expect(strips(page)).toHaveCount(2);
  await expect(strips(page).nth(0).getByRole('heading', { name: 'النحو' })).toBeVisible();
  await expect(strips(page).nth(1).getByRole('heading', { name: 'الإملاء' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تصنيف فاضي' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'مخفي من الأشرطة' })).toHaveCount(0);
  await expect(strips(page).nth(0).locator('.shelf-rail__item')).toHaveCount(14);
  await expect(strips(page).nth(1).locator('.shelf-rail__item')).toHaveCount(2);

  // the book that sits only on the series is not lost: it is in the last strip
  const rest = page.getByTestId('node-strip-rest');
  await expect(rest.getByRole('heading', { name: 'كتب أخرى' })).toBeVisible();
  await expect(rest.locator('.shelf-rail__item')).toHaveCount(1);

  // «عرض الكل» goes to that node's own page, and the plain list of everything is one link away
  await expect(strips(page).nth(0).getByRole('link', { name: 'عرض الكل' })).toHaveAttribute('href', '/books?node=c-big');
  await expect(hero.getByRole('link', { name: 'عرض كل الكتب في قائمة واحدة' })).toHaveAttribute('href', '/books?series=ser&view=all');

  // the search-result title and description are the ones written in the dashboard
  await expect(page).toHaveTitle(/عنوان خاص للسلسلة/);
});

test('الفيديو بيتحمّل بعد الضغط عليه بس', async ({ page }) => {
  await stubTree(page);
  await page.route('**/*youtube.com/embed/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>player</p>' }));
  await page.route('**/i.ytimg.com/**', (route) => route.fulfill({ status: 204 }));
  await page.goto('/books?series=ser');
  const video = page.getByTestId('node-video');
  await expect(video).toBeVisible({ timeout: 20_000 });
  await expect(video.locator('iframe')).toHaveCount(0);
  await video.getByRole('button', { name: /تشغيل فيديو/ }).click();
  await expect(video.locator('iframe')).toHaveAttribute('src', /youtube\.com\/embed\/dQw4w9WgXcQ/);
});

test('الشريط بيتسحب بالماوس يمين وشمال، والسحب مبيفتحش كتاب', async ({ page }) => {
  await stubTree(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/books?series=ser');
  const track = strips(page).first().locator('.scroll-rail__track');
  await expect(track).toBeVisible({ timeout: 20_000 });
  const size = await track.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(size.scroll).toBeGreaterThan(size.client);

  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  const y = box.y + box.height / 2;
  // In a right-to-left page the strip starts at its right edge: pulling it to the right shows the books further on.
  const startLeft = await track.evaluate((el) => el.scrollLeft);
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });
  await page.mouse.up();
  const afterPull = await track.evaluate((el) => el.scrollLeft);
  expect(afterPull).toBeLessThan(startLeft);
  expect(new URL(page.url()).pathname).toMatch(/\/books$/); // no book was opened by the pull

  // and back the other way (once the strip has settled onto a book: a second pull must start from where it rests)
  await expect.poll(async () => { const a = await track.evaluate((el) => el.scrollLeft); await page.waitForTimeout(150); return a === (await track.evaluate((el) => el.scrollLeft)); }).toBe(true);
  const settled = await track.evaluate((el) => el.scrollLeft);
  await page.mouse.move(box.x + box.width * 0.7, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 8 });
  await page.mouse.up();
  // (the strip settles onto a book after the release, so the position is read until it has)
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(settled);
});

test('حد الشريط من اللوحة: بيعرض أول ٣ كتب والعدّاد بيقول كام كتاب فيه', async ({ page }) => {
  await stubTree(page);
  await page.goto('/books?series=ser-short');
  await expect(strips(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(strips(page).first().locator('.shelf-rail__item')).toHaveCount(3);
  await expect(strips(page).first().getByText('5 كتاب')).toBeVisible();
  // no text and no video: just the name and the strips
  await expect(page.getByTestId('node-video')).toHaveCount(0);
});

test('القسم (جديد) بيعرض السلاسل اللي تحته كأشرطة، وكل شريط يفتح صفحته', async ({ page }) => {
  await stubTree(page);
  await page.goto('/books?node=sec');
  const hero = page.getByTestId('node-hero');
  await expect(hero.getByRole('heading', { level: 1, name: 'قسم اللغة' })).toBeVisible({ timeout: 20_000 });
  await expect(strips(page)).toHaveCount(1);
  await expect(strips(page).first().getByRole('heading', { name: 'سلسلة الاختبار' })).toBeVisible();
  await strips(page).first().getByRole('link', { name: 'عرض الكل' }).click();
  await expect(page).toHaveURL(/\/books\?series=ser$/);
  await expect(page.getByTestId('node-hero').getByRole('heading', { level: 1, name: 'سلسلة الاختبار' })).toBeVisible();
});

test('تصنيف ملوش أبناء بيفتح قايمة كتب عادية، وبيتفلتر على كتبه هو', async ({ page }) => {
  await stubTree(page);
  await page.goto('/books?node=c-small');
  await expect(page.getByRole('heading', { level: 1, name: 'الإملاء' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('node-hero')).toHaveCount(0);
  await expect(strips(page)).toHaveCount(0);
  await expect(page.getByText(/2 كتاب مطابق/)).toBeVisible();
  await expect(page.locator('.book-card')).toHaveCount(2);
  // the filter shows as a chip that can be taken off
  await page.getByRole('button', { name: /إزالة تصنيف: الإملاء/ }).click();
  await expect(page.getByText(/22 كتاب مطابق/)).toBeVisible();
});

test('«عرض كل الكتب»: قايمة واحدة بكل كتب السلسلة من غير أشرطة، والنص فوقها', async ({ page }) => {
  await stubTree(page);
  await page.goto('/books?series=ser&view=all');
  await expect(page.getByText(/مطابق/).first()).toBeVisible({ timeout: 20_000 });
  await expect(strips(page)).toHaveCount(0);
  await expect(page.getByTestId('node-hero')).toHaveCount(0);
});

test('سلسلة اتحددلها «شبكة»: النص فوق وقايمة كتب واحدة من غير أشرطة', async ({ page }) => {
  await stubTree(page);
  await page.goto('/books?series=ser-grid');
  const hero = page.getByTestId('node-hero');
  await expect(hero.getByRole('heading', { level: 1, name: 'سلسلة شبكة' })).toBeVisible({ timeout: 20_000 });
  await expect(hero.getByText('نص فوق الشبكة')).toBeVisible();
  await expect(strips(page)).toHaveCount(0);
  await expect(page.locator('.book-card')).toHaveCount(3);
});

test('سلسلة مش في شجرة الموقع (مخفية) بتفتح القايمة القديمة من غير ما الصفحة تقع', async ({ page }) => {
  await stubTree(page, []);
  await page.goto('/books?series=ser');
  await expect(page.locator('.catalog-filters')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('node-hero')).toHaveCount(0);
  await expect(strips(page)).toHaveCount(0);
});
