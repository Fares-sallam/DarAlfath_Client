import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';
import { fakeFrames, lastMessage } from '../support/fakeFrames';

// «مظهر المتجر» ← «تفاصيل العرض»: what a book card, a book's page and the footer show, for the website and for the app.
// Hermetic: the saved row is answered by the spec (and what the page writes is caught here); nothing reaches the database.

test.use({ storageState: { cookies: [], origins: [] } });

type Written = { id: number; display: Record<string, any> };

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Answers the saved appearance row with `display` and catches every save; `missing` answers like a database without the column. */
const BOOK_A = '0b1f6f7e-2a3b-4c5d-8e9f-1a2b3c4d5e6f';
const BOOK_B = '1c2f7f8e-3b4c-4d6e-9fa0-2b3c4d5e6f70';

async function setUp(page: Page, opts: { display?: unknown; missing?: boolean; silent?: boolean } = {}) {
  await signInAsFakeOwner(page);
  await fakeFrames(page, { silent: opts.silent });
  // a few real-looking books for the preview's book page
  await page.route('**/rest/v1/products?*', (route) => (route.request().method() === 'GET'
    ? json(route, [{ id: BOOK_A, title: 'كتاب أ' }, { id: BOOK_B, title: 'كتاب ب' }])
    : route.fallback()));
  let display: unknown = opts.display ?? {};
  const writes: Written[] = [];
  await page.route('**/rest/v1/storefront_appearance*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      if (opts.missing) return json(route, { code: '42703', message: 'column storefront_appearance.display does not exist' }, 400);
      return json(route, { pattern_strength: 100, strip_arrangement: 'uniform', home_sections: [], button_styles: {}, display });
    }
    const body = JSON.parse(req.postData() ?? '{}') as Written;
    writes.push(body);
    display = body.display;
    return route.fulfill({ status: 201, body: '' });
  });
  await page.goto('/appearance?tab=display');
  await expect(page.getByTestId('display-page')).toBeVisible({ timeout: 20_000 });
  return { writes };
}

const toggle = (page: Page, label: string) => page.locator(`label[title="${label}"]`).click();
const checked = (page: Page, label: string) => page.getByRole('checkbox', { name: label });
const saveBar = (page: Page) => page.getByTestId('display-save-bar');

test('الشكل الأول: كل عنصر زي ما الموقع والتطبيق كانوا بيعرضوه، والتذييل بعموديه', async ({ page }) => {
  await setUp(page);
  // the card: the website has always shown the share button, the app never had one (a dash, not a switch)
  await expect(checked(page, 'زر المشاركة في الموقع')).toBeChecked();
  await expect(checked(page, 'زر المشاركة في التطبيق')).toHaveCount(0);
  await expect(page.getByTestId('display-row-card-share')).toContainText('—');
  // the app has always marked a low stock, the website never did
  await expect(checked(page, 'شارة «آخر نسخ» في الموقع')).not.toBeChecked();
  await expect(checked(page, 'شارة «آخر نسخ» في التطبيق')).toBeChecked();
  await expect(checked(page, 'شارة «جديد» في الموقع')).not.toBeChecked();
  // the page: ISBN and language are the app's, the trust row is the website's
  await expect(checked(page, 'الترقيم الدولي ISBN في التطبيق')).toBeChecked();
  await expect(checked(page, 'اللغة في الموقع')).toHaveCount(0);
  await expect(checked(page, 'شريط الثقة في الموقع')).toBeChecked();
  await expect(checked(page, 'شريط الثقة في التطبيق')).not.toBeChecked();
  await expect(page.getByTestId('display-trust-0').getByRole('textbox')).toHaveValue('منتج أصلي');
  await expect(page.getByTestId('display-trust-1').getByRole('textbox')).toHaveValue('شحن سريع');
  // the footer
  await expect(page.getByTestId('display-footer-col-0').getByRole('textbox').first()).toHaveValue('روابط سريعة');
  await expect(page.getByTestId('display-footer-col-1').getByRole('textbox').first()).toHaveValue('خدمة العملاء');
  await expect(page.getByTestId('display-copyright-preview')).toContainText(`© ${new Date().getFullYear()} دار الفتح`);
  // nothing changed yet
  await expect(saveBar(page)).toHaveCount(0);
  await expect(page.getByTestId('display-reset')).toBeDisabled();
});

test('الكارت: مفتاح الموقع ومفتاح التطبيق منفصلين، والحفظ بيبعت القيم', async ({ page }) => {
  const { writes } = await setUp(page);

  await toggle(page, 'زر المشاركة في الموقع');
  await toggle(page, 'شارة «جديد» في الموقع');
  await toggle(page, 'شارة «آخر نسخ» في الموقع');
  await page.getByTestId('display-new-days').fill('14');
  await page.getByTestId('display-low-stock').fill('8');
  await page.getByRole('radio', { name: 'مبلغ (وفّر 30 ج.م)' }).click();
  await page.getByRole('radio', { name: '4' }).first().click();

  await expect(saveBar(page)).toBeVisible();
  await page.getByTestId('display-save').click();
  await expect.poll(() => writes.length).toBe(1);

  const card = writes[0].display.card;
  expect(writes[0].id).toBe(1);
  expect(card.show.share).toEqual({ web: false, app: false });
  expect(card.show.isNew).toEqual({ web: true, app: false });
  expect(card.show.lowStock).toEqual({ web: true, app: true });
  expect(card.newDays).toBe(14);
  expect(card.lowStockAt).toBe(8);
  expect(card.discountStyle).toBe('amount');
  expect(card.perRow.desktop).toBe(4);
  expect(card.perRow.mobile).toBeNull();
  // saved: the bar goes away and what was saved is what shows
  await expect(saveBar(page)).toHaveCount(0);
  await expect(checked(page, 'زر المشاركة في الموقع')).not.toBeChecked();
});

test('اللي اتحفظ قبل كده بيرجع زي ما هو، وزرار «رجوع للشكل الأصلي» بيمسح كل حاجة', async ({ page }) => {
  const saved = { card: { show: { rating: { web: false, app: true } }, newDays: 90 }, page: { trust: [{ icon: 'return', text: 'استرجاع خلال 14 يوم' }] }, footer: { showContact: false } };
  await setUp(page, { display: saved });
  await expect(checked(page, 'التقييم بالنجوم في الموقع')).not.toBeChecked();
  await expect(checked(page, 'التقييم بالنجوم في التطبيق')).toBeChecked();
  await expect(page.getByTestId('display-new-days')).toHaveValue('90');
  await expect(page.getByTestId('display-trust-0').getByRole('textbox')).toHaveValue('استرجاع خلال 14 يوم');
  await expect(page.getByTestId('display-trust-1')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'عمود بيانات التواصل' })).not.toBeChecked();

  await page.getByTestId('display-reset').click();
  await expect(checked(page, 'التقييم بالنجوم في الموقع')).toBeChecked();
  await expect(page.getByTestId('display-new-days')).toHaveValue('30');
  await expect(page.getByTestId('display-trust-1').getByRole('textbox')).toHaveValue('شحن سريع');
  await expect(saveBar(page)).toBeVisible(); // it differs from what is saved until it is saved
});

test('شارات الثقة: تتكتب وتتغير أيقونتها وتتحرك وتتمسح، ولحد 4 بس', async ({ page }) => {
  const { writes } = await setUp(page);
  const add = page.getByTestId('display-trust-add');
  await add.click();
  await add.click();
  await expect(add).toBeDisabled();
  await expect(page.getByTestId('display-trust-3')).toBeVisible();

  // a badge with no words is named, and cannot be saved
  await expect(page.getByTestId('display-problems')).toContainText('شارة الثقة رقم 3');
  await expect(page.getByTestId('display-save')).toBeDisabled();

  await page.getByTestId('display-trust-2').getByRole('textbox').fill('استرجاع خلال 14 يوم');
  await page.getByTestId('display-trust-2').getByRole('combobox').selectOption('return');
  await page.getByTestId('display-trust-3').getByRole('button', { name: 'احذف الشارة' }).click();
  await expect(page.getByTestId('display-problems')).toHaveCount(0);

  await page.getByTestId('display-trust-2').getByRole('button', { name: 'لفوق' }).click();
  await page.getByTestId('display-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].display.page.trust).toEqual([
    { icon: 'shield', text: 'منتج أصلي' },
    { icon: 'return', text: 'استرجاع خلال 14 يوم' },
    { icon: 'truck', text: 'شحن سريع' },
  ]);
});

test('التذييل: رابط بعنوان غلط بيتسمّى ومبيتحفظش، وبعد التصحيح بيتحفظ، والسنة بتتحط لوحدها', async ({ page }) => {
  const { writes } = await setUp(page);
  const col = page.getByTestId('display-footer-col-0');
  await col.getByRole('button', { name: 'رابط', exact: true }).click();
  const row = page.getByTestId('display-footer-link-0-5');
  await row.getByRole('textbox').nth(0).fill('صفحتنا');
  await row.getByRole('textbox').nth(1).fill('javascript:alert(1)');
  await expect(page.getByTestId('display-problems')).toContainText('«صفحتنا»');
  await expect(row).toContainText('لازم يبدأ بـ');
  await expect(page.getByTestId('display-save')).toBeDisabled();

  await row.getByRole('textbox').nth(1).fill('https://darolfath.com/links');
  await expect(page.getByTestId('display-problems')).toHaveCount(0);

  // the second column and its contact block go, the bottom lines change
  await page.getByTestId('display-footer-col-1').getByRole('button', { name: 'احذف العمود' }).click();
  await toggle(page, 'عمود بيانات التواصل');
  await page.getByTestId('display-copyright').fill('كل الحقوق © {year} للدار');
  await page.getByTestId('display-note').fill('');
  await expect(page.getByTestId('display-copyright-preview')).toContainText(`كل الحقوق © ${new Date().getFullYear()} للدار`);

  await page.getByTestId('display-save').click();
  await expect.poll(() => writes.length).toBe(1);
  const footer = writes[0].display.footer;
  expect(footer.columns).toHaveLength(1);
  expect(footer.columns[0].title).toBe('روابط سريعة');
  expect(footer.columns[0].links).toHaveLength(6);
  expect(footer.columns[0].links[5]).toEqual({ label: 'صفحتنا', url: 'https://darolfath.com/links' });
  expect(footer.showContact).toBe(false);
  expect(footer.copyright).toBe('كل الحقوق © {year} للدار');
  expect(footer.note).toBe('');
});

test('عمود التذييل: لحد 3 أعمدة، وترتيب الروابط بيتغير', async ({ page }) => {
  await setUp(page);
  const add = page.getByTestId('display-footer-add-column');
  await add.click();
  await expect(add).toBeDisabled();
  await page.getByTestId('display-footer-col-0').getByRole('button', { name: 'الرابط لتحت' }).first().click();
  await expect(page.getByTestId('display-footer-link-0-0').getByRole('textbox').first()).toHaveValue('الكتب');
  await expect(page.getByTestId('display-footer-link-0-1').getByRole('textbox').first()).toHaveValue('الرئيسية');
});

test('التبويبين: الرجوع لتبويب الألوان والعودة مبيضيعش المسودة', async ({ page }) => {
  await setUp(page);
  await toggle(page, 'زر المفضلة في الموقع');
  await expect(saveBar(page)).toBeVisible();
  await page.getByTestId('appearance-tab-look').click();
  await expect(page).toHaveURL(/\/appearance$/);
  await expect(page.getByTestId('appearance-page')).toBeVisible();
  await expect(page.getByTestId('display-page')).toBeHidden();
  await page.getByTestId('appearance-tab-display').click();
  await expect(page).toHaveURL(/tab=display/);
  await expect(checked(page, 'زر المفضلة في الموقع')).not.toBeChecked();
  await expect(saveBar(page)).toBeVisible();
});

test('قاعدة بيانات من غير العمود الجديد: الصفحة بتفتح وتنبّه ومبتسمحش بالحفظ', async ({ page }) => {
  await setUp(page, { missing: true });
  await expect(page.getByTestId('display-missing')).toBeVisible();
  await toggle(page, 'زر المفضلة في الموقع');
  await expect(page.getByTestId('display-save')).toBeDisabled();
});

// ── the live preview ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('المعاينة الحية: بتفتح الموقع بعلامة المعاينة، وبتبعت المسودة، وبتتحدّث مع كل تغيير قبل الحفظ', async ({ page }) => {
  await setUp(page);
  const frame = page.getByTestId('site-frame');
  await expect(frame).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('site-frame-iframe')).toHaveAttribute('src', /\/books\?preview=display$/);

  // the first draft is what is saved (the defaults here)
  await expect.poll(async () => (await lastMessage(page, 'site'))?.display?.card?.show?.share?.web).toBe(true);
  const first = await lastMessage(page, 'site');
  expect(first.type).toBe('daralfath:display-preview');
  expect(first.navigate).toBe('/books');

  // a change in the form reaches the frame before anything is saved
  await toggle(page, 'زر المشاركة في الموقع');
  await expect.poll(async () => (await lastMessage(page, 'site'))?.display?.card?.show?.share?.web).toBe(false);
  await page.getByTestId('display-copyright').fill('كل الحقوق © {year} للدار');
  await expect.poll(async () => (await lastMessage(page, 'site'))?.display?.footer?.copyright).toBe('كل الحقوق © {year} للدار');
  // ...and nothing was written
  await expect(saveBar(page)).toBeVisible();
});

test('شاشات معاينة الموقع: الكتب، كتاب حقيقي (والكتاب بيتغير)، والتذييل بيمرّر لآخر الصفحة', async ({ page }) => {
  await setUp(page);
  await expect(page.getByTestId('site-frame')).toHaveAttribute('data-ready', 'true');

  await page.getByTestId('screen-book').click();
  await expect.poll(async () => (await lastMessage(page, 'site'))?.navigate).toBe(`/book/${BOOK_A}`);
  await page.getByTestId('preview-book').selectOption(BOOK_B);
  await expect.poll(async () => (await lastMessage(page, 'site'))?.navigate).toBe(`/book/${BOOK_B}`);

  await page.getByTestId('screen-footer').click();
  await expect.poll(async () => (await lastMessage(page, 'site'))?.scroll).toBe('footer');
  expect((await lastMessage(page, 'site')).navigate).toBe('/');

  // the phone and the computer widths of the website
  await page.getByTestId('preview-device-desktop').click();
  await expect(page.getByTestId('site-frame')).toHaveAttribute('data-ready', 'true');
  await expect.poll(async () => (await lastMessage(page, 'site'))?.navigate).toBe('/');
});

test('معاينة التطبيق: بتبعت المسودة مع المسار واللغة والوضع، ولما التطبيق يترد بتتحدّث', async ({ page }) => {
  await setUp(page);
  await page.getByTestId('preview-place-app').click();
  await expect(page.getByTestId('app-frame')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('app-frame-iframe')).toHaveAttribute('src', /dar-alfath-app-preview\.vercel\.app\/$/);

  await expect.poll(async () => (await lastMessage(page, 'app'))?.navigate).toBe('/search');
  const first = await lastMessage(page, 'app');
  expect(first.type).toBe('daralfath:app-preview');
  expect(first.platform).toBe('ios');
  expect(first.language).toBe('ar');
  expect(first.dark).toBe(false);
  expect(first.display.card.show.wishlist).toEqual({ web: true, app: true });

  await toggle(page, 'زر المفضلة في التطبيق');
  await expect.poll(async () => (await lastMessage(page, 'app'))?.display?.card?.show?.wishlist?.app).toBe(false);

  await page.getByRole('radio', { name: 'English' }).click();
  await page.getByRole('radio', { name: 'ليلي' }).click();
  await expect.poll(async () => (await lastMessage(page, 'app'))?.language).toBe('en');
  expect((await lastMessage(page, 'app')).dark).toBe(true);

  await page.getByTestId('screen-book').click();
  await expect.poll(async () => (await lastMessage(page, 'app'))?.navigate).toBe(`/book/${BOOK_A}`);
  // back to the website: its frame is opened again and gets the same draft
  await page.getByTestId('preview-place-site').click();
  await expect(page.getByTestId('site-frame')).toHaveAttribute('data-ready', 'true');
  await expect.poll(async () => (await lastMessage(page, 'site'))?.display?.card?.show?.wishlist?.app).toBe(false);
});

test('لو الصفحة المعروضة ما ردّتش: المعاينة بتقول كده وبتدّي رابط تبويب', async ({ page }) => {
  await page.clock.install();
  await setUp(page, { silent: true });
  await expect(page.getByTestId('site-frame')).toHaveAttribute('data-ready', 'false');
  await page.clock.fastForward(16_000);
  await expect(page.getByTestId('site-frame-failed')).toBeVisible();
  await expect(page.getByTestId('site-frame-failed').getByRole('link')).toHaveAttribute('href', /preview=display/);
});
