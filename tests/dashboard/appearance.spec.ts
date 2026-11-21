import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «مظهر المتجر»: the pattern strength, the pattern strips, the home sections and the four button colours.
//
// This file does not sign in: the dashboard is given a session for the owner in its local storage, and every
// call to Supabase is answered here from memory (the one new table is a small in-memory copy; every other table
// is empty), so nothing reaches the real database and a write is only recorded.

interface Write { method: string; url: string; body: any }

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const DEFAULT_ROW = { pattern_strength: 100, strip_arrangement: 'uniform', home_sections: [], button_styles: {} };

async function setUp(page: Page, opts: { tableMissing?: boolean; row?: Record<string, unknown> } = {}) {
  const state = { row: { ...DEFAULT_ROW, ...(opts.row ?? {}) } as Record<string, unknown> };
  const writes: Write[] = [];

  await signInAsFakeOwner(page);

  // everything else the dashboard reads is empty (an object read, a missing row)
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    if (req.url().includes('/rest/v1/storefront_appearance')) {
      if (opts.tableMissing) {
        return json(route, { code: 'PGRST205', message: "Could not find the table 'public.storefront_appearance' in the schema cache" }, 404);
      }
      if (req.method() === 'GET' || req.method() === 'HEAD') return json(route, wantsObject ? state.row : [state.row]);
      const body = req.postDataJSON();
      writes.push({ method: req.method(), url: req.url(), body });
      state.row = { ...state.row, ...body };
      return route.fulfill({ status: 201, body: '' });
    }
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      return wantsObject ? json(route, { code: 'PGRST116', message: 'no rows' }, 406) : json(route, []);
    }
    return route.fulfill({ status: 201, body: '' });
  });

  return { state, writes };
}

const sectionKeys = (page: Page) =>
  page.locator('[data-testid^="home-section-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.replace('home-section-', '')));

const decode = (href: string) => {
  const value = new URL(href).searchParams.get('previewLook')!;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
};

test.use({ storageState: { cookies: [], origins: [] } });

test('«مظهر المتجر» في القايمة تحت «إدارة الصفحة والروابط»، وبتعرض التصميم الحالي كنقطة بداية', async ({ page }) => {
  await setUp(page);
  await page.goto('/appearance');

  await expect(page.getByRole('heading', { name: 'مظهر المتجر' }).first()).toBeVisible();
  const links = await page.locator('aside nav a').evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ''));
  const linksPage = links.findIndex((t) => t.includes('إدارة الصفحة والروابط'));
  expect(links.findIndex((t) => t.includes('مظهر المتجر'))).toBe(linksPage + 1);

  // the home page's sections moved to the catalog hub: here only a way to it
  await expect(page.getByTestId('home-blocks-link')).toHaveAttribute('href', '/catalog?tab=home');
  expect(await sectionKeys(page)).toEqual([]);
  await expect(page.getByTestId('appearance-save-bar')).toHaveCount(0);
  for (const key of ['view_all', 'view_category', 'add_to_cart', 'quick_buy']) {
    await expect(page.getByTestId(`button-${key}-default`)).toHaveAttribute('aria-checked', 'true');
  }
  await expect(page.getByTestId('appearance-strip').getByRole('radio', { name: /متطابق/ })).toHaveAttribute('aria-checked', 'true');
});

test('ترتيب الأقسام وإخفاؤها، وتنويع الشريط، ودرجة الباترن، وألوان الأزرار: تتحفظ كلها مرة واحدة', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/appearance');
  await expect(page.getByTestId('appearance-sections')).toBeVisible();

  // strips: varied
  await page.getByTestId('appearance-strip').getByRole('radio', { name: /متنوع/ }).first().click();

  // pattern strength
  await page.getByTestId('store-pattern-strength-range').fill('140');
  await expect(page.getByTestId('appearance-pattern')).toContainText('140%');

  // buttons: «أضف للسلة» teal, one step lighter; «الشراء السريع» green; the colour list holds the house colours and nothing else
  const add = page.getByTestId('button-add_to_cart');
  await expect(add.getByRole('radio')).toHaveCount(5);
  await page.getByTestId('button-add_to_cart-teal').click();
  await add.getByRole('radio', { name: 'أفتح', exact: true }).click();
  await page.getByTestId('button-quick_buy-green').click();
  const sample = page.getByTestId('button-add_to_cart-sample');
  await expect(sample).toHaveCSS('background-color', 'rgb(72, 176, 183)');
  await expect(page.getByTestId('button-quick_buy-sample')).toHaveCSS('background-color', 'rgb(6, 126, 112)');
  // the text colour is chosen to be readable on it
  await expect(page.getByTestId('button-quick_buy-sample')).toHaveCSS('color', 'rgb(255, 255, 255)');

  await expect(page.getByTestId('appearance-save-bar')).toBeVisible();
  await page.getByTestId('appearance-save').click();
  await expect(page.getByTestId('appearance-save-bar')).toHaveCount(0);

  expect(writes).toHaveLength(1);
  const row = writes[0].body;
  expect(row.id).toBe(1);
  expect(row.pattern_strength).toBe(140);
  expect(row.strip_arrangement).toBe('varied');
  // the sections are no longer edited here: what was saved before is kept as it was (every section, the house order)
  expect(row.home_sections.map((s: any) => s.key)).toEqual(['departments', 'best-sellers', 'new-arrivals', 'offers', 'categories', 'intro-videos', 'features']);
  expect(row.home_sections.every((s: any) => s.visible)).toBe(true);
  const sameAtNight = { color: 'same', tone: 0 };
  expect(row.button_styles.add_to_cart).toEqual({ color: 'teal', tone: -1, night: sameAtNight });
  expect(row.button_styles.quick_buy).toEqual({ color: 'green', tone: 0, night: sameAtNight });
  expect(row.button_styles.view_all).toEqual({ color: 'default', tone: 0, night: sameAtNight });
});

test('«معاينة المتجر بالتعديلات» بتفتح المتجر بالمسودة اللي على الشاشة، من غير ما تحفظ حاجة', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/appearance');
  await expect(page.getByTestId('appearance-sections')).toBeVisible();

  await page.getByTestId('button-view_all-navy').click();
  await page.getByTestId('store-pattern-strength-range').fill('50');

  const draft = decode((await page.getByTestId('appearance-preview').getAttribute('href'))!);
  expect(draft.pattern_strength).toBe(50);
  expect(draft.button_styles.view_all).toEqual({ color: 'navy', tone: 0, night: { color: 'same', tone: 0 } });
  expect(writes).toHaveLength(0);
});

test('«رجوع للتصميم الأصلي» و«تراجع» بيرجّعوا من غير حفظ', async ({ page }) => {
  const { writes } = await setUp(page, {
    row: { pattern_strength: 30, strip_arrangement: 'varied', button_styles: { quick_buy: { color: 'mint', tone: 2 } } },
  });
  await page.goto('/appearance');
  await expect(page.getByTestId('button-quick_buy-mint')).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'رجوع للتصميم الأصلي' }).click();
  await expect(page.getByTestId('button-quick_buy-default')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('appearance-pattern')).toContainText('100%');
  await expect(page.getByTestId('appearance-save-bar')).toBeVisible();

  await page.getByRole('button', { name: 'تراجع' }).click();
  await expect(page.getByTestId('button-quick_buy-mint')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('appearance-pattern')).toContainText('30%');
  expect(writes).toHaveLength(0);
});

test('لو تحديث قاعدة البيانات لسه ما اتطبقش: الصفحة بتقول كده وبتسيبك تجرّب بس مش بتحفظ', async ({ page }) => {
  const { writes } = await setUp(page, { tableMissing: true });
  await page.goto('/appearance');

  await expect(page.getByTestId('appearance-missing')).toBeVisible();
  await page.getByTestId('button-add_to_cart-teal').click();
  await expect(page.getByTestId('appearance-save-bar')).toBeVisible();
  await expect(page.getByTestId('appearance-save')).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test('ألوان الأزرار لكل وضع: النهاري والليلي، والعينة بتتعرض على خلفية الوضع اللي بتعدّله، والحفظ بيكتب الاتنين', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/appearance');
  const add = page.getByTestId('button-add_to_cart');
  await expect(add).toBeVisible();

  // day is the tab that opens: the sample sits on a light stage and the choices are the original plus the four house colours
  await expect(page.getByTestId('button-theme-light')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('button-add_to_cart-stage')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(add.getByRole('radio')).toHaveCount(5);
  await page.getByTestId('button-add_to_cart-teal').click();

  // night: a dark stage, and two more choices: "same as the day" (the start) and the night look the button was designed with
  await page.getByTestId('button-theme-dark').click();
  await expect(page.getByTestId('button-theme-dark')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('button-add_to_cart-stage')).toHaveCSS('background-color', 'rgb(0, 16, 42)');
  await expect(add.getByRole('radio')).toHaveCount(6);
  await expect(page.getByTestId('button-add_to_cart-same')).toHaveAttribute('aria-checked', 'true');
  // same as the day: the sample is the day's teal
  await expect(page.getByTestId('button-add_to_cart-sample')).toHaveCSS('background-color', 'rgb(42, 163, 171)');

  await page.getByTestId('button-add_to_cart-mint').click();
  await add.getByRole('radio', { name: 'أغمق', exact: true }).click();
  await expect(page.getByTestId('button-add_to_cart-sample')).toHaveCSS('background-color', 'rgb(187, 200, 198)');

  // the day colour was not touched by what was chosen for the night
  await page.getByTestId('button-theme-light').click();
  await expect(page.getByTestId('button-add_to_cart-teal')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('button-add_to_cart-sample')).toHaveCSS('background-color', 'rgb(42, 163, 171)');

  // quick buy: green by day, the original look at night
  await page.getByTestId('button-quick_buy-green').click();
  await page.getByTestId('button-theme-dark').click();
  await page.getByTestId('button-quick_buy-default').click();
  await expect(page.getByTestId('button-quick_buy').getByRole('radiogroup').first()).toBeVisible();
  // "original" at night has no tone to choose
  await expect(page.getByTestId('button-quick_buy').getByRole('radio', { name: 'أفتح كثيرًا' })).toHaveCount(0);

  await page.getByTestId('appearance-save').click();
  await expect(page.getByTestId('appearance-save-bar')).toHaveCount(0);
  expect(writes).toHaveLength(1);
  const styles = writes[0].body.button_styles;
  expect(styles.add_to_cart).toEqual({ color: 'teal', tone: 0, night: { color: 'mint', tone: 1 } });
  expect(styles.quick_buy).toEqual({ color: 'green', tone: 0, night: { color: 'default', tone: 0 } });
  expect(styles.view_all).toEqual({ color: 'default', tone: 0, night: { color: 'same', tone: 0 } });

  // the preview link carries the night colours too
  const draft = decode((await page.getByTestId('appearance-preview').getAttribute('href'))!);
  expect(draft.button_styles.add_to_cart.night).toEqual({ color: 'mint', tone: 1 });
});

test('صفحة قديمة محفوظة من غير ألوان ليلية: بتفتح و«نفس لون النهار» مختار للأزرار', async ({ page }) => {
  await setUp(page, { row: { button_styles: { add_to_cart: { color: 'teal', tone: -1 } } } });
  await page.goto('/appearance');
  await page.getByTestId('button-theme-dark').click();
  await expect(page.getByTestId('button-add_to_cart-same')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('button-view_all-same')).toHaveAttribute('aria-checked', 'true');
});

test('زرّا صفحة تسجيل العملاء (الدخول والتبويب) في «ألوان الأزرار»: بنفس ألوان الهوية ولكل وضع، وبيتحفظوا مع الباقي', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/appearance');
  const submit = page.getByTestId('button-auth_submit');
  const tabs = page.getByTestId('button-auth_tabs');
  await expect(submit).toContainText('زر الدخول والتسجيل');
  await expect(tabs).toContainText('تبويب الدخول / إنشاء حساب');
  await expect(page.getByTestId('appearance-pattern')).toContainText('صفحة تسجيل العملاء');

  // day: the house colours only; the button's sample follows
  await expect(submit.getByRole('radio')).toHaveCount(5);
  await page.getByTestId('button-auth_submit-green').click();
  await expect(page.getByTestId('button-auth_submit-sample')).toHaveCSS('background-color', 'rgb(6, 126, 112)');
  // night: its own colour (and the original night look), without touching the day one
  await page.getByTestId('button-theme-dark').click();
  await page.getByTestId('button-auth_submit-mint').click();
  await page.getByTestId('button-auth_tabs-teal').click();
  await page.getByTestId('button-theme-light').click();
  await expect(page.getByTestId('button-auth_submit-green')).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('appearance-save').click();
  await expect(page.getByTestId('appearance-save-bar')).toHaveCount(0);
  const styles = writes[0].body.button_styles;
  expect(styles.auth_submit).toEqual({ color: 'green', tone: 0, night: { color: 'mint', tone: 0 } });
  expect(styles.auth_tabs).toEqual({ color: 'default', tone: 0, night: { color: 'teal', tone: 0 } });

  // the store's preview link carries them
  const draft = decode((await page.getByTestId('appearance-preview').getAttribute('href'))!);
  expect(draft.button_styles.auth_submit.color).toBe('green');
});
