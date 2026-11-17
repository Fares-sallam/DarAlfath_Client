import { test, expect, type Page, type Route } from '../fixtures';

// «مظهر المتجر»: the pattern strength, the pattern strips, the home sections and the four button colours.
//
// This file does not sign in: the dashboard is given a session for the owner in its local storage, and every
// call to Supabase is answered here from memory (the one new table is a small in-memory copy; every other table
// is empty), so nothing reaches the real database and a write is only recorded.

const OWNER = 'faresalsaid780@gmail.com';

interface Write { method: string; url: string; body: any }

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const DEFAULT_ROW = { pattern_strength: 100, strip_arrangement: 'uniform', home_sections: [], button_styles: {} };

async function setUp(page: Page, opts: { tableMissing?: boolean; row?: Record<string, unknown> } = {}) {
  const state = { row: { ...DEFAULT_ROW, ...(opts.row ?? {}) } as Record<string, unknown> };
  const writes: Write[] = [];

  await page.addInitScript((email) => {
    const user = {
      id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email,
      app_metadata: {}, user_metadata: {}, created_at: '2020-01-01T00:00:00Z',
    };
    localStorage.setItem('darelfath-auth-token', JSON.stringify({
      access_token: 'a.b.c', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86_400,
      refresh_token: 'r', user,
    }));
  }, OWNER);

  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) {
      return json(route, {
        id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: OWNER,
        app_metadata: {}, user_metadata: {}, created_at: '2020-01-01T00:00:00Z',
      });
    }
    return json(route, {});
  });

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

  // an empty saved row is the house look: every section, in the order the home page always had, all showing
  expect(await sectionKeys(page)).toEqual(['departments', 'best-sellers', 'new-arrivals', 'offers', 'categories', 'intro-videos', 'features']);
  await expect(page.getByTestId('appearance-save-bar')).toHaveCount(0);
  for (const key of ['view_all', 'view_category', 'add_to_cart', 'quick_buy']) {
    await expect(page.getByTestId(`button-${key}-default`)).toHaveAttribute('aria-checked', 'true');
  }
  await expect(page.getByTestId('appearance-strip').getByRole('radio', { name: /متطابق/ })).toHaveAttribute('aria-checked', 'true');
});

test('ترتيب الأقسام وإخفاؤها، وتنويع الشريط، ودرجة الباترن، وألوان الأزرار: تتحفظ كلها مرة واحدة', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/appearance');
  await expect(page.getByTestId('home-section-departments')).toBeVisible();

  // order: the first section goes down one place; the third is hidden
  await page.getByRole('button', { name: 'حرّك السلاسل (الأقسام السريعة) لأسفل' }).click();
  expect((await sectionKeys(page)).slice(0, 2)).toEqual(['best-sellers', 'departments']);
  await page.locator('label[title="إظهار فيديوهات «من الدار»"]').click();

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
  expect(row.home_sections.slice(0, 2).map((s: any) => s.key)).toEqual(['best-sellers', 'departments']);
  expect(row.home_sections.find((s: any) => s.key === 'intro-videos').visible).toBe(false);
  expect(row.home_sections.filter((s: any) => s.visible)).toHaveLength(6);
  expect(row.button_styles.add_to_cart).toEqual({ color: 'teal', tone: -1 });
  expect(row.button_styles.quick_buy).toEqual({ color: 'green', tone: 0 });
  expect(row.button_styles.view_all).toEqual({ color: 'default', tone: 0 });
});

test('«معاينة المتجر بالتعديلات» بتفتح المتجر بالمسودة اللي على الشاشة، من غير ما تحفظ حاجة', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/appearance');
  await expect(page.getByTestId('home-section-features')).toBeVisible();

  await page.locator('label[title="إظهار مربعات المزايا"]').click();
  await page.getByTestId('button-view_all-navy').click();
  await page.getByTestId('store-pattern-strength-range').fill('50');

  const draft = decode((await page.getByTestId('appearance-preview').getAttribute('href'))!);
  expect(draft.pattern_strength).toBe(50);
  expect(draft.home_sections.find((s: any) => s.key === 'features').visible).toBe(false);
  expect(draft.button_styles.view_all).toEqual({ color: 'navy', tone: 0 });
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
