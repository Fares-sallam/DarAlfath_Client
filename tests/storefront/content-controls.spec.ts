import { test, expect, type Page, type Route } from '../fixtures';

// What the dashboard's "إدارة الإعلانات والأشرطة" page (and two texts in settings) control on the store:
// the offers strip under the header, the category strip, the "الأكثر مبيعًا" row, the boxes above the
// footer, the footer's line and the videos' title. The rows the dashboard would have saved are answered
// in flight; books and categories are the real ones. Nothing is written anywhere.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

/** One row (maybeSingle) or a list, as the request asked for. */
const reply = (route: Route, rows: unknown[]) => {
  const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
  return single ? json(route, rows[0] ?? null) : json(route, rows);
};

/** A rewrite cut short by a reload or the end of the test just lets the request go. */
const tolerant = (handler: (route: Route) => Promise<unknown>) => async (route: Route) => {
  try {
    await handler(route);
  } catch {
    await route.continue().catch(() => undefined);
  }
};

interface Content {
  announcements?: { id: string; message: string; link_url: string | null }[];
  barItems?: (cats: { id: string; slug: string; name: string }[]) => { category_id: string; is_visible: boolean; sort_order: number }[];
  settings?: { all_books_in_bar: boolean; intro_videos_title: string };
  boxes?: unknown[] | 'error';
  bestSellers?: (ids: string[]) => string[];
  footer?: string | null;
}

async function withContent(page: Page, c: Content) {
  const state: { cats: { id: string; slug: string; name: string }[]; ids: string[]; titles: Map<string, string> } = { cats: [], ids: [], titles: new Map() };
  await page.route('**/rest/v1/site_announcements*', (r) => reply(r, c.announcements ?? []));
  await page.route('**/rest/v1/site_content_settings*', (r) => reply(r, [c.settings ?? { all_books_in_bar: true, intro_videos_title: 'فيديوهات تعريفية' }]));
  await page.route('**/rest/v1/home_feature_boxes*', (r) => (c.boxes === 'error' ? json(r, { message: 'down' }, 500) : reply(r, c.boxes ?? [])));
  await page.route('**/rest/v1/categories*', tolerant(async (r) => {
    const response = await r.fetch();
    const rows = (await response.json()) as { id: string; slug: string; name: string }[];
    if (rows[0]?.id) state.cats = rows;
    await r.fulfill({ response, json: rows });
  }));
  await page.route('**/rest/v1/category_bar_items*', async (r) => {
    // Answered once the categories are known (both are read together).
    for (let i = 0; i < 50 && !state.cats.length; i++) await new Promise((res) => setTimeout(res, 50));
    return reply(r, c.barItems ? c.barItems(state.cats) : []);
  });
  await page.route('**/rest/v1/products_public_catalog*', tolerant(async (r) => {
    const response = await r.fetch();
    const rows = (await response.json()) as { product_id: string; title: string }[];
    state.ids = rows.map((row) => row.product_id);
    rows.forEach((row) => state.titles.set(row.product_id, row.title));
    await r.fulfill({ response, json: rows });
  }));
  await page.route('**/rest/v1/home_best_sellers*', async (r) => {
    for (let i = 0; i < 50 && !state.ids.length; i++) await new Promise((res) => setTimeout(res, 50));
    return reply(r, (c.bestSellers ? c.bestSellers(state.ids) : []).map((product_id) => ({ product_id })));
  });
  await page.route('**/rest/v1/store_settings*', async (r) => {
    const base = { store_name: 'دار الفتح للنشر والتوزيع', store_description: '', store_email: '', store_phone: '', store_address: '', updated_at: '2026-10-15T00:00:00Z' };
    return reply(r, [{ ...base, footer_tagline: c.footer ?? null }]);
  });
  return state;
}

test('شريط العروض: تحت الهيدر، والرسايل بتتبدل كل 5 ثواني، والوقوف عليه بيثبّتها، والرابط الداخلي بيفتح الصفحة', async ({ page }) => {
  await page.clock.install();
  await withContent(page, {
    announcements: [
      { id: 'a1', message: 'شحن مجاني فوق 500 جنيه', link_url: '/books?sale=1' },
      { id: 'a2', message: 'خصم 20٪ على سلسلة النحو', link_url: null },
    ],
  });
  await page.goto('/');
  const bar = page.getByRole('region', { name: 'عروض وإعلانات' });
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await page.mouse.move(5, 600);
  await expect(page.getByTestId('announcement')).toHaveText('شحن مجاني فوق 500 جنيه');

  // Right under the header, above the category strip.
  const [header, strip, categories] = await Promise.all([
    page.locator('header.site-header').boundingBox(),
    bar.boundingBox(),
    page.locator('nav.category-bar').boundingBox(),
  ]);
  expect(Math.abs(strip!.y - (header!.y + header!.height))).toBeLessThan(2);
  expect(categories!.y).toBeGreaterThanOrEqual(strip!.y + strip!.height - 1);

  await page.clock.runFor(5_200);
  await expect(page.getByTestId('announcement')).toHaveText('خصم 20٪ على سلسلة النحو');

  // Pointing at it holds the message.
  await bar.hover();
  await page.clock.runFor(12_000);
  await expect(page.getByTestId('announcement')).toHaveText('خصم 20٪ على سلسلة النحو');
  await page.mouse.move(5, 600);
  await page.clock.runFor(5_200);
  await expect(page.getByTestId('announcement')).toHaveText('شحن مجاني فوق 500 جنيه');

  await page.getByRole('link', { name: 'شحن مجاني فوق 500 جنيه' }).click();
  await expect(page).toHaveURL(/\/books\?sale=1$/);
});

test('شريط العروض: من غير رسايل مش ظاهر خالص', async ({ page }) => {
  await withContent(page, { announcements: [] });
  await page.goto('/');
  await expect(page.locator('nav.category-bar')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'عروض وإعلانات' })).toHaveCount(0);
});

test('شريط التصنيفات: الترتيب والإخفاء من لوحة التحكم، و«كل الكتب» بيتقفل', async ({ page }) => {
  await withContent(page, {
    settings: { all_books_in_bar: false, intro_videos_title: 'فيديوهات تعريفية' },
    barItems: () => [],
  });
  await page.goto('/');
  const pills = page.locator('nav.category-bar .category-bar__pill');
  await expect.poll(() => pills.count(), { timeout: 20_000 }).toBeGreaterThan(2);
  const before = (await pills.allTextContents()).map((t) => t.trim());
  expect(before).not.toContain('كل الكتب');
  expect(before.length).toBeGreaterThan(2);

  // Now with a place given: the last one first, the first one off.
  const first = before[before.length - 1];
  const hidden = before[0];
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await withContent(page, {
    settings: { all_books_in_bar: true, intro_videos_title: 'فيديوهات تعريفية' },
    barItems: (cats) => {
      const id = (name: string) => cats.find((c) => c.name.trim() === name)!.id;
      return [
        { category_id: id(first), is_visible: true, sort_order: 0 },
        { category_id: id(hidden), is_visible: false, sort_order: 1 },
      ];
    },
  });
  await page.reload();
  await expect.poll(async () => (await pills.allTextContents()).map((t) => t.trim())[1], { timeout: 20_000 }).toBe(first);
  const after = (await pills.allTextContents()).map((t) => t.trim());
  expect(after[0]).toBe('كل الكتب');
  expect(after[1]).toBe(first);
  expect(after).not.toContain(hidden);
  expect(after.length).toBe(before.length + 1 - 1); // "كل الكتب" back, one hidden
});

test('«الأكثر مبيعًا» مكان «من رفوف الدار»: الكتب المختارة بترتيبها، ومن غير اختيار الصف مش ظاهر', async ({ page }) => {
  const picked: string[] = [];
  const state = await withContent(page, {
    bestSellers: (ids) => {
      picked.splice(0, picked.length, ids[4], ids[1], ids[7]);
      return picked;
    },
  });
  await page.goto('/');
  const row = page.getByTestId('best-sellers');
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByRole('heading', { name: 'الأكثر مبيعًا' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'من رفوف الدار' })).toHaveCount(0);
  await expect(row.locator('.shelf-rail__item')).toHaveCount(3);

  // In the order picked.
  const labels = await row.locator('article.book-card').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(labels).toEqual(picked.map((id) => `فتح صفحة ${state.titles.get(id)}`));

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await withContent(page, { bestSellers: () => [] });
  await page.reload();
  await expect(page.getByTestId('new-arrivals')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('best-sellers')).toHaveCount(0);
});

test('مربعات أعلى الفوتر: من لوحة التحكم (أيقونة أو صورة)، ولو اتعذّر التحميل بترجع الأربعة الأصليين', async ({ page }) => {
  await withContent(page, {
    boxes: [
      { id: 'b1', title: 'هدية مع كل طلب', description: 'كتيب تلوين مجانًا', icon_key: 'gift', image_url: null },
      { id: 'b2', title: 'خدمة المدارس', description: 'أسعار خاصة للجملة', icon_key: null, image_url: 'https://example.invalid/box.png' },
    ],
  });
  await page.route('https://example.invalid/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: '' }));
  await page.goto('/');
  const boxes = page.getByTestId('feature-boxes');
  await boxes.scrollIntoViewIfNeeded({ timeout: 20_000 });
  await expect(boxes.locator('.feature-pill')).toHaveCount(2);
  await expect(boxes).toContainText('هدية مع كل طلب');
  await expect(boxes.locator('.feature-pill').nth(0).locator('svg')).toHaveCount(1);
  await expect(boxes.locator('.feature-pill').nth(1).locator('img')).toHaveAttribute('src', 'https://example.invalid/box.png');

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await withContent(page, { boxes: 'error' });
  await page.reload();
  const fallback = page.getByTestId('feature-boxes');
  await fallback.scrollIntoViewIfNeeded({ timeout: 20_000 });
  await expect(fallback.locator('.feature-pill')).toHaveCount(4);
  await expect(fallback).toContainText('دعم العملاء');
});

test('نص الفوتر وعنوان الفيديوهات من لوحة التحكم، وفاضيين بيرجعوا للنص الأصلي', async ({ page }) => {
  await withContent(page, { footer: 'كتب تربي أجيالًا', settings: { all_books_in_bar: true, intro_videos_title: 'شاهد الدار' } });
  await page.goto('/');
  await expect(page.locator('.site-footer__brand p')).toHaveText('كتب تربي أجيالًا', { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'شاهد الدار' })).toBeVisible();

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await withContent(page, { footer: '   ' });
  await page.reload();
  await expect(page.locator('.site-footer__brand p')).toHaveText(/^ننشر المعرفة الهادفة/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'فيديوهات تعريفية' })).toBeVisible();
});

test('نص الفوتر الطويل: بيظهر كله بسطوره، وعموده أعرض من الباقي، ومن غير ما يوسّع الصفحة', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const longText = 'شركتنا دار الفتح للنشر والتوزيع رائدة في مجال النشر التعليمي والتربوي للأطفال. نسعى بفضل الله أن نصنع من الأطفال جيلًا قادرًا على التمييز والتقدم من خلال نشر الكتب القيمة والهادفة في مختلف المجالات، (الدينية والتعليمية والتربوية).';
  await withContent(page, { footer: `${longText}\nسطر ثانٍ كتبه المدير` });
  await page.goto('/');
  const paragraph = page.locator('.site-footer__brand p');
  await expect(paragraph).toContainText('نسعى بفضل الله', { timeout: 20_000 });
  await expect(paragraph).toContainText('سطر ثانٍ كتبه المدير');
  // Nothing cut off, and the line break the manager typed is kept.
  expect(await paragraph.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  expect(await paragraph.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('pre-line');
  // Room for it: the first column is clearly wider than the link columns.
  const widths = await page.locator('.site-footer__grid > *').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  expect(widths[0]).toBeGreaterThan(widths[1] * 1.5);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});
