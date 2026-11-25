import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';
import { fakeFrames, lastMessage } from '../support/fakeFrames';

// «إدارة المخزون» ← «إظهار عدد النسخ للعملاء»: one switch for the website and one for the app (storefront_appearance.show_stock_count),
// tried on the real book page before saving. Hermetic: no real sign-in; the database is a variable here and writes are recorded.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

type Switches = { web: boolean; app: boolean };

async function setUp(page: Page, initial: Switches | 'missing' = { web: true, app: true }) {
  const db = { value: initial === 'missing' ? ({ web: true, app: true } as Switches) : initial };
  const writes: { body: any; url: string }[] = [];
  await signInAsFakeOwner(page);
  await fakeFrames(page);
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    const url = req.url();
    const get = req.method() === 'GET' || req.method() === 'HEAD';
    if (url.includes('/rest/v1/storefront_appearance')) {
      if (get) {
        if (initial === 'missing') return json(route, { code: '42703', message: 'column storefront_appearance.show_stock_count does not exist' }, 400);
        return json(route, { show_stock_count: db.value });
      }
      const body = req.postDataJSON();
      writes.push({ body, url });
      db.value = body.show_stock_count;
      return json(route, [{ id: 1 }]);
    }
    if (url.includes('/rest/v1/products?') && get) return json(route, [{ id: 'b1', title: 'كتاب للمعاينة' }]);
    if (get) return json(route, []);
    return route.fallback();
  });
  return { db, writes };
}

const card = (page: Page) => page.getByTestId('stock-count-card');
const web = (page: Page) => page.getByTestId('stock-switch-web');
const app = (page: Page) => page.getByTestId('stock-switch-app');

test('الزرارين بيعرضوا الحالة المحفوظة: واحد للموقع وواحد للتطبيق، ومعاهم الوصف', async ({ page }) => {
  await setUp(page, { web: true, app: false });
  await page.goto('/inventory');
  await expect(card(page)).toBeVisible({ timeout: 20_000 });
  await expect(web(page)).toHaveAttribute('aria-checked', 'true');
  await expect(app(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('stock-state-web')).toContainText('الرقم ظاهر');
  await expect(page.getByTestId('stock-state-app')).toContainText('الرقم مخفي');
  await expect(card(page)).toContainText('مع أول نسخة جديدة منه');
  await expect(page.getByTestId('stock-save')).toBeDisabled();
  // no change yet: no frame is opened by itself
  await expect(page.getByTestId('stock-live-preview')).toHaveCount(0);
});

test('قفل زرار الموقع: المعاينة بتفتح لوحدها على صفحة كتاب وبتاخد الإعداد، والحفظ بيبعت الزرارين', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/inventory');
  await expect(web(page)).toBeEnabled({ timeout: 20_000 });

  await web(page).click();
  await expect(web(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('stock-dirty')).toBeVisible();
  await expect(page.getByTestId('stock-live-preview')).toBeVisible();
  await expect.poll(async () => (await lastMessage(page, 'site'))?.stockCount).toEqual({ web: false, app: true });
  expect((await lastMessage(page, 'site')).navigate).toBe('/book/b1');
  expect(writes).toHaveLength(0);

  await page.getByTestId('stock-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toEqual({ show_stock_count: { web: false, app: true } });
  await expect(page.getByTestId('stock-dirty')).toHaveCount(0);
  await expect(page.getByTestId('stock-save')).toBeDisabled();
  await expect(web(page)).toHaveAttribute('aria-checked', 'false');
});

test('زرار التطبيق لوحده: بيتحفظ من غير ما يلمس زرار الموقع', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/inventory');
  await expect(app(page)).toBeEnabled({ timeout: 20_000 });
  await app(page).click();
  await page.getByTestId('stock-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toEqual({ show_stock_count: { web: true, app: false } });
});

test('لو حد غيّر زرار التاني في الوقت ده (من التطبيق): الحفظ ما بيمسحش تغييره', async ({ page }) => {
  const { db, writes } = await setUp(page);
  await page.goto('/inventory');
  await expect(web(page)).toBeEnabled({ timeout: 20_000 });
  await web(page).click();
  // meanwhile the app's inventory screen turned its own switch off
  db.value = { web: true, app: false };
  await page.getByTestId('stock-save').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toEqual({ show_stock_count: { web: false, app: false } });
});

test('زرار «تراجع» بيرجّع المحفوظ، وزرار «معاينة» بيفتح ويقفل المعاينة من غير تعديل', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/inventory');
  await expect(web(page)).toBeEnabled({ timeout: 20_000 });
  await web(page).click();
  await app(page).click();
  await expect(page.getByTestId('stock-dirty')).toBeVisible();
  await page.getByTestId('stock-reset').click();
  await expect(web(page)).toHaveAttribute('aria-checked', 'true');
  await expect(app(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('stock-dirty')).toHaveCount(0);
  expect(writes).toHaveLength(0);

  await expect(page.getByTestId('stock-live-preview')).toHaveCount(0);
  await page.getByTestId('stock-preview-toggle').click();
  await expect(page.getByTestId('stock-live-preview')).toBeVisible();
  await expect.poll(async () => (await lastMessage(page, 'site'))?.stockCount).toEqual({ web: true, app: true });
  await page.getByTestId('stock-preview-toggle').click();
  await expect(page.getByTestId('stock-live-preview')).toHaveCount(0);
});

test('الإعداد مش متفعّل على القاعدة: رسالة واضحة، والزرارين مقفولين ومش بيتحفظ حاجة', async ({ page }) => {
  const { writes } = await setUp(page, 'missing');
  await page.goto('/inventory');
  await expect(page.getByTestId('stock-missing')).toBeVisible({ timeout: 20_000 });
  await expect(web(page)).toBeDisabled();
  await expect(app(page)).toBeDisabled();
  await expect(page.getByTestId('stock-save')).toBeDisabled();
  await expect(page.getByTestId('stock-preview-toggle')).toBeDisabled();
  expect(writes).toHaveLength(0);
});
