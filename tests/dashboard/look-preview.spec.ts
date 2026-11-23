import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';
import { fakeFrames, lastMessage } from '../support/fakeFrames';

// «مظهر المتجر ← الألوان والباترن»: the live preview beside the form. The real website (a frame, fed the unsaved look by message) on the
// page the section being edited belongs to, by day or by night. Hermetic: the frames are answered by a stand-in that keeps what it is
// sent, and nothing reaches the database.

test.use({ storageState: { cookies: [], origins: [] } });

const DEFAULT_ROW = { pattern_strength: 100, strip_arrangement: 'uniform', home_sections: [], button_styles: {}, updated_at: '2026-11-20T00:00:00Z' };
const BOOK = '0b1f6f7e-2a3b-4c5d-8e9f-1a2b3c4d5e6f';
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function setUp(page: Page, opts: { silent?: boolean } = {}) {
  await signInAsFakeOwner(page);
  await fakeFrames(page, { silent: opts.silent });
  await page.route('**/rest/v1/products?*', (route) => (route.request().method() === 'GET' ? json(route, [{ id: BOOK, title: 'كتاب أ' }]) : route.fallback()));
  await page.route('**/rest/v1/storefront_appearance*', (route) => {
    const method = route.request().method();
    if (method !== 'GET' && method !== 'HEAD') return route.fulfill({ status: 405, body: '' });
    const wantsObject = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return json(route, wantsObject ? DEFAULT_ROW : [DEFAULT_ROW]);
  });
  await page.goto('/appearance');
  await expect(page.getByTestId('appearance-buttons')).toBeVisible({ timeout: 20_000 });
}

const site = (page: Page) => lastMessage(page, 'site');
const preview = (page: Page) => page.getByTestId('look-live-preview');

test('المعاينة الحية: الموقع الحقيقي بعلامة المعاينة، وأول رسالة هي المظهر المحفوظ بالوضع النهاري على الرئيسية', async ({ page }) => {
  await setUp(page);
  await expect(page.getByTestId('look-frame')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('look-frame-iframe')).toHaveAttribute('src', /\?preview=display$/);
  await expect.poll(async () => (await site(page))?.appearance?.pattern_strength).toBe(100);
  const first = await site(page);
  expect(first.type).toBe('daralfath:display-preview');
  expect(first.theme).toBe('light');
  expect(first.navigate).toBe('/');
  // the look is what this message is about: it carries no display settings
  expect('display' in first).toBe(false);
});

test('كل تعديل بيوصل الموقع قبل الحفظ: الباترن، الشريط، لون الزرار', async ({ page }) => {
  await setUp(page);
  await expect(page.getByTestId('look-frame')).toHaveAttribute('data-ready', 'true');

  await page.getByTestId('store-pattern-strength-range').fill('140');
  await expect.poll(async () => (await site(page))?.appearance?.pattern_strength).toBe(140);

  await page.getByTestId('appearance-strip').getByRole('radio', { name: /متنوع/ }).first().click();
  await expect.poll(async () => (await site(page))?.appearance?.strip_arrangement).toBe('varied');

  await page.getByTestId('button-add_to_cart-teal').click();
  await expect.poll(async () => (await site(page))?.appearance?.button_styles?.add_to_cart?.color).toBe('teal');
  // ...and nothing was written by looking (the save bar is the only way)
  await expect(page.getByTestId('appearance-save-bar')).toBeVisible();
});

test('دوس على أي قسم والصفحة المناسبة ليه بتتعرض: الباترن والشريط على الرئيسية، الأزرار على الصفحة اللي بتظهر فيها', async ({ page }) => {
  await setUp(page);
  await expect(page.getByTestId('look-frame')).toHaveAttribute('data-ready', 'true');

  await page.getByTestId('button-add_to_cart-teal').click();
  await expect.poll(async () => (await site(page))?.navigate).toBe('/books');
  await page.getByTestId('button-auth_submit-teal').click();
  await expect.poll(async () => (await site(page))?.navigate).toBe('/account');
  await page.getByTestId('button-view_all-navy').click();
  await expect.poll(async () => (await site(page))?.navigate).toBe('/');
  await page.getByTestId('button-quick_buy-green').click();
  await expect.poll(async () => (await site(page))?.navigate).toBe('/books');
  await page.getByTestId('store-pattern-strength-range').focus();
  await expect.poll(async () => (await site(page))?.navigate).toBe('/');

  // and the buttons above the preview choose the page too, including a real book's page
  await preview(page).getByTestId('screen-book').click();
  await expect.poll(async () => (await site(page))?.navigate).toBe(`/book/${BOOK}`);
  await preview(page).getByTestId('screen-account').click();
  await expect.poll(async () => (await site(page))?.navigate).toBe('/account');
});

test('الوضع النهاري والليلي: زرار الوضع في الصفحة وزرار الوضع في المعاينة نفس الاختيار، واللي بيتبعت هو الوضع', async ({ page }) => {
  await setUp(page);
  await expect(page.getByTestId('look-frame')).toHaveAttribute('data-ready', 'true');

  await page.getByTestId('button-theme-dark').click();
  await expect.poll(async () => (await site(page))?.theme).toBe('dark');
  await expect(preview(page).getByTestId('preview-theme-dark')).toHaveAttribute('aria-checked', 'true');

  await preview(page).getByTestId('preview-theme-light').click();
  await expect.poll(async () => (await site(page))?.theme).toBe('light');
  await expect(page.getByTestId('button-theme-light')).toHaveAttribute('aria-selected', 'true');
});

test('الحجم: موبايل وكمبيوتر، والفتح في تبويب جديد لسه موجود', async ({ page }) => {
  await setUp(page);
  await expect(page.getByTestId('look-frame')).toHaveAttribute('data-ready', 'true');
  await preview(page).getByTestId('preview-device-desktop').click();
  await expect(page.getByTestId('look-frame')).toHaveAttribute('data-ready', 'true');
  await expect.poll(async () => (await site(page))?.appearance?.pattern_strength).toBe(100);
  await expect(page.getByTestId('appearance-preview')).toHaveAttribute('href', /previewLook=/);
});

test('المعاينة ثابتة على الشمال وإنت بتنزل، في نص صندوقها، ومبتغطّيش أزرار أعلى الصفحة', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setUp(page);
  await expect(page.getByTestId('look-frame')).toHaveAttribute('data-ready', 'true');
  const dock = page.getByTestId('appearance-page').getByTestId('preview-dock');
  await expect(dock).toHaveAttribute('data-docked', 'true');

  const top = (await dock.boundingBox())!;
  const shell = (await preview(page).boundingBox())!;
  const frame = (await page.getByTestId('look-frame-iframe').boundingBox())!;
  expect(frame.x).toBeGreaterThanOrEqual(Math.max(0, shell.x));
  expect(Math.abs(frame.x + frame.width / 2 - (shell.x + shell.width / 2))).toBeLessThan(6);

  // the page's own buttons (top-left: «رجوع للتصميم الأصلي», «معاينة المتجر بالتعديلات») are free
  await page.getByTestId('button-add_to_cart-teal').click();
  await page.getByRole('button', { name: /رجوع للتصميم الأصلي/ }).click();
  await expect(page.getByTestId('button-add_to_cart-teal')).toHaveAttribute('aria-checked', 'false');

  for (const y of [900, 2400, 99999]) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(300);
    const now = (await dock.boundingBox())!;
    expect(Math.abs(now.x - top.x)).toBeLessThan(2);
    expect(now.y).toBeGreaterThanOrEqual(90);
    expect(now.y).toBeLessThan(110);
    const f = (await page.getByTestId('look-frame-iframe').boundingBox())!;
    expect(f.y + f.height).toBeLessThanOrEqual(900);
  }
});

test('لو الموقع ما ردّش: المعاينة بتقول كده وبتدّي رابط تبويب', async ({ page }) => {
  await page.clock.install();
  await setUp(page, { silent: true });
  await expect(page.getByTestId('look-frame')).toHaveAttribute('data-ready', 'false');
  await page.clock.fastForward(16_000);
  await expect(page.getByTestId('look-frame-failed')).toBeVisible();
});

test('التبويبين: المعاينة مفتوحة للتبويب اللي ظاهر بس، والتنقل بينهم مبيضيّعش المسودة', async ({ page }) => {
  await setUp(page);
  await expect(page.getByTestId('look-frame')).toHaveAttribute('data-ready', 'true');
  // the other tab's frame is not even there (it would load the whole store for nothing)
  await expect(page.getByTestId('site-frame')).toHaveCount(0);
  await page.getByTestId('button-add_to_cart-teal').click();

  await page.getByTestId('appearance-tab-display').click();
  await expect(page.getByTestId('site-frame')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('look-frame')).toHaveCount(0);

  await page.getByTestId('appearance-tab-look').click();
  await expect(page.getByTestId('look-frame')).toHaveAttribute('data-ready', 'true');
  // the unsaved colour is still the draft, and the new frame is sent it
  await expect(page.getByTestId('button-add_to_cart-teal')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await site(page))?.appearance?.button_styles?.add_to_cart?.color).toBe('teal');
});
