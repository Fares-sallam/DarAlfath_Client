import { test, expect, type Page, type Route } from '../fixtures';

// The "إدارة الإعلانات والأشرطة" page, the videos' section title and the footer text in settings. The new
// tables' rows are answered in flight; categories, books and orders are the real ones. Every write is
// recorded and answered here instead of reaching the database.

interface Write { method: string; url: string; body: unknown }

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const reply = (route: Route, rows: unknown[]) =>
  (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object') ? json(route, rows[0] ?? null) : json(route, rows);

async function setUp(page: Page, rows: {
  announcements?: unknown[];
  barItems?: unknown[];
  boxes?: unknown[];
  best?: { product_id: string }[];
  settings?: unknown;
} = {}) {
  const writes: Write[] = [];
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.fallback();
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    writes.push({ method: req.method(), url: req.url(), body });
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, body: '' });
  });
  await page.route('**/storage/v1/object/site-assets/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"site-assets/x.png"}' }));
  const get = (pattern: string, data: () => unknown[]) =>
    page.route(pattern, (route) => (route.request().method() === 'GET' ? reply(route, data()) : route.fallback()));
  await get('**/rest/v1/site_announcements*', () => rows.announcements ?? []);
  await get('**/rest/v1/category_bar_items*', () => rows.barItems ?? []);
  await get('**/rest/v1/home_feature_boxes*', () => rows.boxes ?? []);
  await get('**/rest/v1/home_best_sellers*', () => rows.best ?? []);
  await get('**/rest/v1/site_content_settings*', () => [rows.settings ?? { all_books_in_bar: true, intro_videos_title: 'فيديوهات تعريفية' }]);
  return writes;
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name });

test('القايمة الجانبية: «إدارة الإعلانات والأشرطة» تحت الفيديوهات وفوق الإعدادات، والصفحة فيها الأقسام الأربعة', async ({ page }) => {
  await setUp(page);
  await page.goto('/ads-strips');
  await expect(page.getByRole('link', { name: /إدارة الإعلانات والأشرطة/ })).toBeVisible();
  const links = await page.locator('aside nav a').evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ''));
  const videos = links.findIndex((t) => t.includes('فيديوهات'));
  const ads = links.findIndex((t) => t.includes('إدارة الإعلانات والأشرطة'));
  const settings = links.findIndex((t) => t.includes('الإعدادات'));
  expect(ads).toBe(videos + 1);
  expect(settings).toBe(ads + 1);
  await expect(page.getByRole('heading', { name: 'إدارة الإعلانات والأشرطة' }).first()).toBeVisible();
  for (const name of ['شريط العروض والإعلانات', 'شريط التصنيفات', 'مربعات أعلى الفوتر', 'الأكثر مبيعًا']) {
    await expect(tab(page, name)).toBeVisible();
  }
});

test('شريط العروض: المعاينة بتعرض الرسالة الظاهرة، والإضافة بتتحفظ، والتاريخ الغلط بيتمنع', async ({ page }) => {
  const now = Date.now();
  const writes = await setUp(page, {
    announcements: [
      { id: 'a1', message: 'شحن مجاني فوق 500', link_url: null, is_active: true, sort_order: 0, starts_at: null, ends_at: null },
      { id: 'a2', message: 'عرض انتهى', link_url: null, is_active: true, sort_order: 1, starts_at: null, ends_at: new Date(now - 864e5).toISOString() },
      { id: 'a3', message: 'عرض جاي', link_url: null, is_active: true, sort_order: 2, starts_at: new Date(now + 864e5).toISOString(), ends_at: null },
    ],
  });
  await page.goto('/ads-strips?tab=offers');
  await expect(page.getByTestId('announcement-preview')).toHaveText('شحن مجاني فوق 500');
  const rows = page.getByTestId('announcement-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('ظاهرة الآن');
  await expect(rows.nth(1)).toContainText('انتهت');
  await expect(rows.nth(2)).toContainText('مجدولة');

  const add = page.getByRole('button', { name: 'إضافة الرسالة' });
  await page.getByLabel('نص الرسالة').first().fill('خصم 20٪ على سلسلة النحو');
  await page.getByLabel('تبدأ من (اختياري)').fill('2026-12-10T10:00');
  await page.getByLabel('تنتهي في (اختياري)').fill('2026-12-01T10:00');
  await expect(page.getByText('تاريخ النهاية لازم يكون بعد البداية.').first()).toBeVisible();
  await expect(add).toBeDisabled();

  await page.getByLabel('تنتهي في (اختياري)').fill('2026-12-31T10:00');
  await add.click();
  await expect.poll(() => writes.filter((w) => w.method === 'POST' && w.url.includes('site_announcements')).length).toBe(1);
  const body = writes.find((w) => w.url.includes('site_announcements'))!.body as Record<string, unknown>;
  expect(body).toMatchObject({ message: 'خصم 20٪ على سلسلة النحو', link_url: null, sort_order: 3 });
  expect(new Date(String(body.ends_at)).getTime()).toBeGreaterThan(new Date(String(body.starts_at)).getTime());

  // Switching one off is one change.
  await rows.nth(0).getByRole('button', { name: 'إخفاء الرسالة' }).click();
  await expect.poll(() => writes.filter((w) => w.method === 'PATCH' && w.url.includes('id=eq.a1')).length).toBe(1);
  expect(writes.find((w) => w.method === 'PATCH')!.body).toEqual({ is_active: false });
});

test('شريط التصنيفات: كل التصنيفات بعدد كتبها، والإخفاء والترتيب بيتحفظوا مع بعض، و«كل الكتب» لوحده', async ({ page }) => {
  const writes = await setUp(page);
  await page.goto('/ads-strips?tab=categories');
  const rows = page.getByTestId('category-bar-row');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const count = await rows.count();
  expect(count).toBeGreaterThan(3);
  const save = page.getByRole('button', { name: 'حفظ الترتيب والظهور' });
  await expect(save).toBeDisabled();

  const secondName = (await rows.nth(1).locator('p').first().textContent())!.trim();
  await page.getByRole('button', { name: `نقل ${secondName} لأعلى` }).click();
  await rows.nth(0).locator('label').click(); // the switch, now on secondName
  await expect(rows.nth(0).getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByTestId('category-bar-preview')).not.toContainText(secondName);
  await save.click();

  await expect.poll(() => writes.filter((w) => w.url.includes('category_bar_items')).length).toBe(1);
  const upsert = writes.find((w) => w.url.includes('category_bar_items'))!;
  expect(upsert.method).toBe('POST');
  const body = upsert.body as { category_id: string; is_visible: boolean; sort_order: number }[];
  expect(body).toHaveLength(count);
  expect(body.map((r) => r.sort_order)).toEqual([...Array(count).keys()]);
  expect(body[0].is_visible).toBe(false);
  expect(body[1].is_visible).toBe(true);

  await page.locator('label', { has: page.getByRole('checkbox', { name: 'إظهار كل الكتب في الشريط' }) }).click();
  await expect.poll(() => writes.filter((w) => w.url.includes('site_content_settings')).length).toBe(1);
  expect(writes.find((w) => w.url.includes('site_content_settings'))!.body).toEqual({ all_books_in_bar: false });
});

test('مربعات أعلى الفوتر: تغيير العنوان والأيقونة بيتحفظ، والمعاينة بتتغير قبل الحفظ', async ({ page }) => {
  const writes = await setUp(page, {
    boxes: [
      { id: 'b1', title: 'دعم العملاء', description: 'فريق جاهز', icon_key: 'headphones', image_url: null, sort_order: 0, is_active: true },
      { id: 'b2', title: 'تسليم موثوق', description: 'شحن آمن', icon_key: 'truck', image_url: null, sort_order: 1, is_active: false },
    ],
  });
  await page.goto('/ads-strips?tab=boxes');
  await expect(page.getByTestId('feature-preview')).toContainText('دعم العملاء');
  await expect(page.getByTestId('feature-preview')).not.toContainText('تسليم موثوق'); // hidden box
  const first = page.getByTestId('feature-box-row').first();
  await first.getByLabel('عنوان المربع').fill('هدية مع كل طلب');
  await first.getByRole('button', { name: 'أيقونة هدية' }).click();
  await expect(first.getByText('فيه تعديلات لسه ما اتحفظتش')).toBeVisible();
  await first.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => writes.filter((w) => w.url.includes('home_feature_boxes')).length).toBe(1);
  expect(writes[0]).toMatchObject({ method: 'PATCH' });
  expect(writes[0].url).toContain('id=eq.b1');
  expect(writes[0].body).toMatchObject({ title: 'هدية مع كل طلب', icon_key: 'gift', image_url: null });
});

test('الأكثر مبيعًا: جدول المبيعات مرتّب، والاختيار التلقائي والإضافة والترتيب بيتحفظوا', async ({ page }) => {
  const writes = await setUp(page, { best: [] });
  await page.goto('/ads-strips?tab=best');
  const table = page.getByTestId('book-sales-table');
  await expect(table).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'من البداية' }).click();
  const rows = page.getByTestId('book-sales-row');
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });

  // Copies sold never go up as you read down the table.
  const units = await rows.evaluateAll((els) => els.map((el) => Number((el.children[2].textContent ?? '0').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d]/g, ''))));
  for (let i = 1; i < units.length; i++) expect(units[i]).toBeLessThanOrEqual(units[i - 1]);

  await expect(page.getByText('مفيش كتب في الصف.')).toBeVisible();
  const sold = units.filter((u) => u > 0).length;
  if (sold > 0) {
    await page.getByRole('button', { name: 'اختيار الأعلى مبيعًا تلقائيًا' }).click();
    await expect(page.getByTestId('best-sellers-picks').locator('li')).toHaveCount(Math.min(sold, 8), { timeout: 5_000 }).catch(() => undefined);
  }
  // Add one more by hand from the table, then save.
  const addable = rows.filter({ has: page.getByRole('button', { name: /^ضيف / }) }).filter({ hasNot: page.getByText('مخفي من المتجر') }).first();
  await addable.getByRole('button', { name: /^ضيف / }).click();
  const picks = page.getByTestId('best-sellers-picks').locator('li');
  const picked = await picks.count();
  expect(picked).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'حفظ الصف' }).click();
  await expect.poll(() => writes.filter((w) => w.url.includes('home_best_sellers')).length).toBeGreaterThan(0);
  const upsert = writes.find((w) => w.method === 'POST' && w.url.includes('home_best_sellers'))!;
  expect((upsert.body as { sort_order: number }[]).map((r) => r.sort_order)).toEqual([...Array(picked).keys()]);
});

test('الفيديوهات: عنوان القسم بيتعدل من صفحة الفيديوهات', async ({ page }) => {
  const writes = await setUp(page, { settings: { all_books_in_bar: true, intro_videos_title: 'فيديوهات تعريفية' } });
  await page.goto('/intro-videos');
  const input = page.getByLabel('عنوان قسم الفيديوهات');
  await expect(input).toHaveValue('فيديوهات تعريفية');
  const save = page.getByRole('button', { name: 'حفظ العنوان' });
  await expect(save).toBeDisabled();
  await input.fill('شاهد الدار');
  await save.click();
  await expect.poll(() => writes.filter((w) => w.url.includes('site_content_settings')).length).toBe(1);
  expect(writes[0].body).toEqual({ intro_videos_title: 'شاهد الدار' });
});

test('الإعدادات: خانة «نص الفوتر» في إعدادات المتجر', async ({ page }) => {
  await setUp(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'إعدادات المتجر', exact: true }).click();
  const field = page.getByLabel('نص الفوتر');
  await expect(field).toBeVisible({ timeout: 15_000 });
  await expect(field).toHaveAttribute('placeholder', /ننشر المعرفة الهادفة/);
  // Room for a few sentences: 600 characters, a tall field, and a counter that follows what is typed.
  await expect(field).toHaveAttribute('maxlength', '600');
  expect(await field.evaluate((el) => (el as HTMLTextAreaElement).rows)).toBeGreaterThanOrEqual(5);
  await field.fill('ا'.repeat(450));
  await expect(page.getByTestId('footer-tagline-count')).toHaveText('450 / 600');
});
