import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «التحكم في التطبيق»: the maintenance screen, the forced / recommended update by build number, and the promotional pop-up.
// Hermetic: the saved row is answered by the spec (and what the page writes is caught here); nothing reaches the database.

test.use({ storageState: { cookies: [], origins: [] } });

type Written = { id: number; maintenance: Record<string, any>; update_policy: Record<string, any>; popup: Record<string, any> };

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function setUp(page: Page, opts: { row?: Partial<Written>; missing?: boolean } = {}) {
  await signInAsFakeOwner(page);
  let row = { maintenance: {}, update_policy: {}, popup: {}, ...(opts.row ?? {}) };
  const writes: Written[] = [];
  await page.route('**/rest/v1/app_control*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      if (opts.missing) return json(route, { code: 'PGRST205', message: "Could not find the table 'public.app_control' in the schema cache" }, 404);
      return json(route, row);
    }
    const body = JSON.parse(req.postData() ?? '{}') as Written;
    writes.push(body);
    row = { maintenance: body.maintenance, update_policy: body.update_policy, popup: body.popup };
    return route.fulfill({ status: 201, body: '' });
  });
  await page.goto('/app-control');
  await expect(page.getByTestId('app-control-maintenance')).toBeVisible({ timeout: 20_000 });
  return { writes };
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
  // the sample shows the house wording while the fields are empty
  await expect(page.getByTestId('maintenance-sample')).toContainText('التطبيق تحت الصيانة');
});

test('الصيانة: بتتشغل بكلامك، والعينة بتتغير، والحفظ بيبعت القيم', async ({ page }) => {
  const { writes } = await setUp(page);
  await toggle(page, 'تشغيل الصيانة');
  await expect(page.getByTestId('maintenance-state')).toHaveText('شغّالة دلوقتي');
  await page.getByTestId('maintenance-title').fill('بنحدّث الموقع');
  await page.getByTestId('maintenance-message').fill('نرجع الساعة 10 الصبح');
  await expect(page.getByTestId('maintenance-sample').locator('[data-sample="title"]')).toHaveText('بنحدّث الموقع');
  await expect(page.getByTestId('maintenance-sample').locator('[data-sample="message"]')).toHaveText('نرجع الساعة 10 الصبح');

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
  await expect(page.getByTestId('popup-sample').locator('[data-sample="button"]')).toHaveCount(0); // no link yet: only a close button
  await page.getByRole('button', { name: 'البحث', exact: true }).click();
  await expect(page.getByTestId('popup-link')).toHaveValue('/search');
  await expect(page.getByTestId('popup-sample').locator('[data-sample="button"]')).toHaveText('تصفّح العروض');
  await expect(page.getByTestId('popup-sample').locator('[data-sample="title"]')).toHaveText('خصم 20%');

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
