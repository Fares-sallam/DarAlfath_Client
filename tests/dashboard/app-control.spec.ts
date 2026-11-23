import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';
import { fakeFrames, lastMessage } from '../support/fakeFrames';

// «التحكم في التطبيق»: the maintenance screen, the forced / recommended update by build number, and the promotional pop-up.
// Hermetic: the saved row is answered by the spec (and what the page writes is caught here); nothing reaches the database.

test.use({ storageState: { cookies: [], origins: [] } });

type Written = { id: number; maintenance: Record<string, any>; update_policy: Record<string, any>; popup: Record<string, any> };

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function setUp(page: Page, opts: { row?: Partial<Written>; missing?: boolean; history?: { id: number; snapshot: Partial<Written> }[] } = {}) {
  await signInAsFakeOwner(page);
  await fakeFrames(page);
  let row = { maintenance: {}, update_policy: {}, popup: {}, updated_at: '2026-11-20T00:00:00Z', ...(opts.row ?? {}) };
  const writes: Written[] = [];
  let history = opts.history ?? [];
  await page.route('**/rest/v1/rpc/control_save', async (route) => {
    const body = route.request().postDataJSON();
    if (body.p_expected !== row.updated_at) return json(route, { code: '40001', message: 'stale' }, 409);
    writes.push(body.p_payload);
    row = { ...row, ...body.p_payload, updated_at: new Date(Date.parse(row.updated_at) + 1000).toISOString() };
    return json(route, null);
  });
  await page.route('**/rest/v1/app_control*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      if (opts.missing) return json(route, { code: 'PGRST205', message: "Could not find the table 'public.app_control' in the schema cache" }, 404);
      return json(route, row);
    }
    return route.fulfill({ status: 405, body: '' });
  });
  await page.route('**/rest/v1/control_publish_history*', (route) => json(route,
    history.map(({ id }) => ({ id, actor: null, created_at: '2026-11-20T00:00:00Z' }))));
  await page.route('**/rest/v1/rpc/control_restore', (route) => {
    const body = route.request().postDataJSON();
    if (body.p_expected !== row.updated_at) return json(route, { code: '40001', message: 'stale' }, 409);
    const entry = history.find((item) => item.id === body.p_history_id);
    if (!entry) return json(route, { code: '42501', message: 'not found' }, 403);
    history = [{ id: 999, snapshot: row }, ...history];
    row = { ...row, ...entry.snapshot, updated_at: new Date(Date.parse(row.updated_at) + 1000).toISOString() };
    return json(route, null);
  });
  await page.goto('/app-control');
  await expect(page.getByTestId('app-control-maintenance')).toBeVisible({ timeout: 20_000 });
  return { writes, externalChange: () => { row = { ...row, updated_at: '2026-11-21T00:00:00Z' }; } };
}

const toggle = (page: Page, label: string) => page.locator(`label[title="${label}"]`).click();
const saveBar = (page: Page) => page.getByTestId('app-control-save-bar');
const save = (page: Page) => page.getByTestId('app-control-save');

test('الشكل الأول: كل حاجة مقفولة ومفيش شريط حفظ', async ({ page }) => {
  await setUp(page);
  await expect(page.getByTestId('maintenance-state')).toHaveText('مقفولة');
  await expect(page.getByTestId('popup-state')).toHaveText('مقفولة');
  await expect(page.getByRole('checkbox', { name: 'تشغيل الصيانة' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'تشغيل النافذة' })).not.toBeChecked();
  await expect(page.getByTestId('min-ios')).toHaveValue('');
  await expect(page.getByTestId('min-android')).toHaveValue('');
  await expect(saveBar(page)).toHaveCount(0);
  await expect(page.getByTestId('app-control-reset')).toBeDisabled();
  // the live preview opens on the maintenance screen, with nothing to say yet (the app uses its house wording)
  await expect(page.getByTestId('app-control-frame')).toHaveAttribute('data-ready', 'true');
  await expect.poll(async () => (await lastMessage(page, 'app'))?.notice).toBe('maintenance');
  expect((await lastMessage(page, 'app')).control.maintenance.title).toBe('');
});

test('الصيانة: بتتشغل بكلامك، والعينة بتتغير، والحفظ بيبعت القيم', async ({ page }) => {
  const { writes } = await setUp(page);
  await toggle(page, 'تشغيل الصيانة');
  await expect(page.getByTestId('maintenance-state')).toHaveText('شغّالة دلوقتي');
  await page.getByTestId('maintenance-title').fill('بنحدّث الموقع');
  await page.getByTestId('maintenance-message').fill('نرجع الساعة 10 الصبح');
  await expect.poll(async () => (await lastMessage(page, 'app'))?.control?.maintenance?.title).toBe('بنحدّث الموقع');
  expect((await lastMessage(page, 'app')).control.maintenance.message).toBe('نرجع الساعة 10 الصبح');
  // switched on in the draft, shown in the preview before anything is saved
  expect((await lastMessage(page, 'app')).control.maintenance.enabled).toBe(true);

  await expect(saveBar(page)).toBeVisible();
  await save(page).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].id).toBe(1);
  expect(writes[0].maintenance.enabled).toBe(true);
  expect(writes[0].maintenance.title).toBe('بنحدّث الموقع');
  expect(writes[0].maintenance.message).toBe('نرجع الساعة 10 الصبح');
  // the other two stay off
  expect(writes[0].popup.enabled).toBe(false);
  expect(writes[0].update_policy.minBuild).toEqual({ ios: null, android: null });
  await expect(saveBar(page)).toHaveCount(0);
});

test('تعديل أحدث من مدير آخر يمنع حفظ مسودة قديمة', async ({ page }) => {
  const { writes, externalChange } = await setUp(page);
  await page.getByTestId('maintenance-title').fill('مسودة قديمة');
  externalChange();
  await save(page).click();
  await expect(page.getByText('الإعدادات اتغيرت من مكان تاني. حدّث الصفحة وراجع التغييرات قبل الحفظ.')).toBeVisible();
  expect(writes).toHaveLength(0);
});

test('سجل النشر يسترجع النسخة السابقة بعد تأكيد المالك', async ({ page }) => {
  await setUp(page, {
    row: { maintenance: { enabled: true, title: 'الحالي' } },
    history: [{ id: 7, snapshot: { maintenance: { enabled: true, title: 'السابق' } } }],
  });
  await expect(page.getByTestId('maintenance-title')).toHaveValue('الحالي');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'استرجاع نسخة 7' }).click();
  await expect(page.getByTestId('maintenance-title')).toHaveValue('السابق');
});

test('جدول أرقام البيلد لا يكسر عرض الصفحة على الهاتف', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setUp(page);
  const table = page.getByRole('table', { name: 'أرقام البيلد' });
  await expect(table).toBeVisible();
  const dimensions = await table.evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
  expect(dimensions.content).toBeGreaterThan(dimensions.width);
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBeLessThanOrEqual(390);
});

test('الصيانة المجدولة: لو الوقت لسه ماجاش بتتسمى «مجدولة»، ونهاية قبل البداية بتتمنع', async ({ page }) => {
  await setUp(page);
  await toggle(page, 'تشغيل الصيانة');
  const future = new Date(Date.now() + 7 * 86_400_000);
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T10:00`;
  const section = page.getByTestId('app-control-maintenance');
  await section.locator('input[type="datetime-local"]').first().fill(local(future));
  await expect(page.getByTestId('maintenance-state')).toHaveText('مجدولة');
  await section.locator('input[type="datetime-local"]').nth(1).fill(local(new Date(Date.now() + 86_400_000)));
  await expect(page.getByTestId('app-control-problems')).toContainText('الصيانة: وقت النهاية');
  await expect(save(page)).toBeDisabled();
});

test('التحديث الإجباري: رفع الحد الأدنى بيسأل الأول، ولو رفضت مفيش حفظ', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.getByTestId('min-ios').fill('12');
  await page.getByTestId('rec-ios').fill('14');
  await page.getByTestId('min-android').fill('17');
  await page.getByTestId('published-ios').fill('12');
  await page.getByTestId('published-android').fill('17');

  const asked: string[] = [];
  page.once('dialog', (d) => { asked.push(d.message()); void d.dismiss(); });
  await save(page).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toContain('iOS');
  expect(asked[0]).toContain('12');
  expect(asked[0]).toContain('أندرويد');
  expect(asked[0]).toContain('17');
  expect(writes).toHaveLength(0);

  page.once('dialog', (d) => { void d.accept(); });
  await save(page).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].update_policy.minBuild).toEqual({ ios: 12, android: 17 });
  expect(writes[0].update_policy.recommendedBuild).toEqual({ ios: 14, android: null });
});

test('التحديث: «مقترح» أقل من «إجباري» ورابط متجر بدون https بيتمنعوا', async ({ page }) => {
  await setUp(page);
  await page.getByTestId('min-ios').fill('12');
  await page.getByTestId('rec-ios').fill('10');
  await expect(page.getByTestId('app-control-problems')).toContainText('مقترح');
  await page.getByTestId('rec-ios').fill('');
  await page.getByTestId('published-ios').fill('12');
  await page.getByTestId('store-ios').fill('http://example.com');
  await expect(page.getByTestId('app-control-problems')).toContainText('https');
  await expect(save(page)).toBeDisabled();
  await page.getByTestId('store-ios').fill('https://apps.apple.com/app/id1');
  await expect(page.getByTestId('app-control-problems')).toHaveCount(0);
  await expect(save(page)).toBeEnabled();
});

test('النافذة: لازم كلام أو صورة، والرابط الجاهز بيتحط، والعينة بتبان، والحفظ بيعمل رقم حملة', async ({ page }) => {
  const { writes } = await setUp(page);
  await toggle(page, 'تشغيل النافذة');
  await expect(page.getByTestId('popup-state')).toHaveText('شغّالة');
  await expect(page.getByTestId('app-control-problems')).toContainText('اكتب عنوان');
  await expect(save(page)).toBeDisabled();

  await page.getByTestId('popup-title').fill('خصم 20%');
  await page.getByTestId('popup-message').fill('على كل الكتب لحد آخر الأسبوع');
  await page.getByTestId('popup-button').fill('تصفّح العروض');
  await page.getByRole('button', { name: 'البحث', exact: true }).click();
  await expect(page.getByTestId('popup-link')).toHaveValue('/search');
  // the editing of the pop-up shows the pop-up in the preview, with the words typed so far
  await expect.poll(async () => (await lastMessage(page, 'app'))?.notice).toBe('popup');
  const shown = (await lastMessage(page, 'app')).control.popup;
  expect(shown).toMatchObject({ title: 'خصم 20%', buttonLabel: 'تصفّح العروض', linkUrl: '/search', enabled: true });

  await page.getByRole('radio', { name: 'مرة كل يوم' }).click();
  await page.getByRole('radio', { name: 'آيفون بس' }).click();
  await save(page).click();
  await expect.poll(() => writes.length).toBe(1);
  const popup = writes[0].popup;
  expect(popup.enabled).toBe(true);
  expect(popup.campaign).toMatch(/^[A-Za-z0-9_-]{4,40}$/);
  expect(popup.title).toBe('خصم 20%');
  expect(popup.linkUrl).toBe('/search');
  expect(popup.frequency).toBe('daily');
  expect(popup.platform).toBe('ios');
  expect(popup.buttonLabel).toBe('تصفّح العروض');

  // «حملة جديدة» gives everybody a new showing: a different campaign id on the next save
  await page.getByTestId('popup-new-campaign').click();
  await save(page).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].popup.campaign).not.toBe(popup.campaign);
});

test('عنوان خطر في رابط النافذة أو صورتها بيتمنع', async ({ page }) => {
  await setUp(page);
  await page.getByTestId('popup-title').fill('عرض');
  await page.getByTestId('popup-link').fill('javascript:alert(1)');
  await expect(page.getByTestId('app-control-problems')).toContainText('الرابط');
  await expect(save(page)).toBeDisabled();
  await page.getByTestId('popup-link').fill('//evil.com');
  await expect(page.getByTestId('app-control-problems')).toContainText('الرابط');
  await page.getByTestId('popup-link').fill('/book/123');
  await expect(page.getByTestId('app-control-problems')).toHaveCount(0);
});

test('اللي اتحفظ قبل كده بيرجع، و«قفل الكل» بيطفي كل حاجة', async ({ page }) => {
  await setUp(page, {
    row: {
      maintenance: { enabled: true, title: 'صيانة', message: 'قريب' },
      update_policy: { minBuild: { ios: 12, android: null }, message: 'حدّث' },
      popup: { enabled: true, campaign: 'camp0001', title: 'عرض', frequency: 'launch', platform: 'android' },
    },
  });
  await expect(page.getByTestId('maintenance-state')).toHaveText('شغّالة دلوقتي');
  await expect(page.getByTestId('maintenance-title')).toHaveValue('صيانة');
  await expect(page.getByTestId('min-ios')).toHaveValue('12');
  await expect(page.getByTestId('update-message')).toHaveValue('حدّث');
  await expect(page.getByRole('radio', { name: 'كل مرة يفتح فيها التطبيق' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'أندرويد بس' })).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('app-control-reset').click();
  await expect(page.getByTestId('maintenance-state')).toHaveText('مقفولة');
  await expect(page.getByTestId('min-ios')).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: 'تشغيل النافذة' })).not.toBeChecked();
});

test('جدول مش موجود: الصفحة بتفتح وتنبّه ومبتسمحش بالحفظ', async ({ page }) => {
  await setUp(page, { missing: true });
  await expect(page.getByTestId('app-control-missing')).toBeVisible();
  await toggle(page, 'تشغيل الصيانة');
  await expect(save(page)).toBeDisabled();
});

// ── the live preview ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('المعاينة الحية: دوس على أي قسم والشاشة بتاعته بتتعرض، وكل تغيير بيوصل التطبيق قبل الحفظ', async ({ page }) => {
  const { writes } = await setUp(page);
  await expect(page.getByTestId('app-control-frame')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('app-control-frame-iframe')).toHaveAttribute('src', /dar-alfath-app-preview\.vercel\.app\/$/);
  await expect.poll(async () => (await lastMessage(page, 'app'))?.notice).toBe('maintenance');

  // editing the update shows the forced update; the minimum typed is in the draft the preview is sent
  await page.getByTestId('min-ios').click();
  await expect.poll(async () => (await lastMessage(page, 'app'))?.notice).toBe('update-required');
  await page.getByTestId('update-message').fill('حدّث دلوقتي بسرعة');
  await expect.poll(async () => (await lastMessage(page, 'app'))?.control?.update?.message).toBe('حدّث دلوقتي بسرعة');

  // the pop-up
  await page.getByTestId('popup-title').click();
  await expect.poll(async () => (await lastMessage(page, 'app'))?.notice).toBe('popup');
  expect((await lastMessage(page, 'app')).navigate).toBe('/');

  // the buttons above the preview choose the screen too (it shows even though its switch is off), and the phone, language, theme
  await page.getByTestId('notice-update-offer').click();
  await expect.poll(async () => (await lastMessage(page, 'app'))?.notice).toBe('update-offer');
  const preview = page.getByTestId('app-control-live-preview');
  await preview.getByRole('radio', { name: 'أندرويد' }).click();
  await preview.getByRole('radio', { name: 'English' }).click();
  await preview.getByRole('radio', { name: 'ليلي' }).click();
  await expect.poll(async () => (await lastMessage(page, 'app'))?.platform).toBe('android');
  const last = await lastMessage(page, 'app');
  expect(last.language).toBe('en');
  expect(last.dark).toBe(true);
  expect(last.control.popup.enabled).toBe(false);

  // nothing was written by looking
  expect(writes).toHaveLength(0);
});

test('المعاينة ثابتة على الشمال وإنت بتنزل لحد آخر الصفحة، والتطبيق كله ظاهر، ومبتغطّيش زرار «قفل الكل»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await setUp(page);
  await expect(page.getByTestId('app-control-frame')).toHaveAttribute('data-ready', 'true');
  const dock = page.getByTestId('preview-dock');
  await expect(dock).toHaveAttribute('data-docked', 'true');

  // at the top it is level with the form, so the page's own buttons are free (a pop-up switched on makes «قفل الكل» clickable)
  await toggle(page, 'تشغيل النافذة');
  await page.getByTestId('popup-title').fill('عرض');
  await page.getByTestId('app-control-reset').click();
  await expect(page.getByTestId('popup-state')).toHaveText('مقفولة');

  // the phone sits in the middle of its box, inside the window (never pushed out at the left)
  const shell = (await page.getByTestId('app-control-live-preview').boundingBox())!;
  const phoneBox = (await page.getByTestId('app-control-frame-iframe').boundingBox())!;
  expect(phoneBox.x).toBeGreaterThanOrEqual(Math.max(0, shell.x));
  expect(phoneBox.x + phoneBox.width).toBeLessThanOrEqual(shell.x + shell.width);
  expect(Math.abs(phoneBox.x + phoneBox.width / 2 - (shell.x + shell.width / 2))).toBeLessThan(6);

  const before = (await dock.boundingBox())!;
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const now = (await dock.boundingBox())!;
  expect(Math.abs(now.x - before.x)).toBeLessThan(2);
  expect(now.y).toBeGreaterThanOrEqual(90);
  expect(now.y).toBeLessThan(110);
  const phone = (await page.getByTestId('app-control-frame-iframe').boundingBox())!;
  expect(phone.y + phone.height).toBeLessThanOrEqual(800);
  // and the preview follows what is being edited even from down there
  await page.getByTestId('popup-title').click();
  await expect.poll(async () => (await lastMessage(page, 'app'))?.notice).toBe('popup');
});
