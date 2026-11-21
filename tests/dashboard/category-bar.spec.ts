import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «شريط التصنيفات» in the catalog hub: close or open the whole strip with one click («غلق الكل» / «فتح الكل»). Hermetic: no
// real sign-in, the tables are answered here and every write is recorded.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const CATEGORIES = [
  { id: 'c1', name: 'نحو', slug: 'nahw' },
  { id: 'c2', name: 'إملاء', slug: 'imla' },
  { id: 'c3', name: 'قصص', slug: 'qisas' },
];

async function setUp(page: Page, initial: { category_id: string; is_visible: boolean; sort_order: number }[], initialAllBooks = true) {
  // what the database holds: a write changes it, so the page's refetch shows the new state
  let items = initial;
  let allBooks = initialAllBooks;
  const writes: { method: string; table: string; body: any }[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const get = req.method() === 'GET' || req.method() === 'HEAD';
    const table = /\/rest\/v1\/([a-z_]+)/.exec(url)?.[1] ?? '';
    if (table === 'categories' && get) return json(route, CATEGORIES);
    if (table === 'category_bar_items') {
      if (get) return json(route, items);
      const body = req.postDataJSON();
      writes.push({ method: req.method(), table, body });
      items = body;
      return route.fulfill({ status: 201, body: '' });
    }
    if (table === 'products' && get) return json(route, CATEGORIES.map((c, i) => ({ id: `p${i}`, category_id: c.id })));
    if (table === 'site_content_settings') {
      if (get) return json(route, { all_books_in_bar: allBooks, intro_videos_title: 'فيديوهات' });
      const body = req.postDataJSON();
      writes.push({ method: req.method(), table, body });
      allBooks = body.all_books_in_bar;
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
  await page.goto('/catalog?tab=menus');
  await expect(page.getByTestId('category-bar-row')).toHaveCount(3, { timeout: 20_000 });
  return { writes };
}

const ROWS = [
  { category_id: 'c1', is_visible: true, sort_order: 0 },
  { category_id: 'c2', is_visible: true, sort_order: 1 },
  { category_id: 'c3', is_visible: false, sort_order: 2 },
];

test('غلق الكل: بيقفل كل التصنيفات و«كل الكتب» وبيحفظ بالترتيب الحالي، والشريط بيبان إنه مش هيظهر', async ({ page }) => {
  const { writes } = await setUp(page, ROWS);
  page.once('dialog', (d) => { expect(d.message()).toContain('هتقفل الشريط كله'); void d.accept(); });
  await page.getByTestId('bar-close-all').click();

  await expect.poll(() => writes.length).toBe(2);
  const bar = writes.find((w) => w.table === 'category_bar_items')!;
  expect(bar.body).toEqual([
    { category_id: 'c1', is_visible: false, sort_order: 0 },
    { category_id: 'c2', is_visible: false, sort_order: 1 },
    { category_id: 'c3', is_visible: false, sort_order: 2 },
  ]);
  expect(writes.find((w) => w.table === 'site_content_settings')!.body).toEqual({ all_books_in_bar: false });
  await expect(page.getByTestId('category-bar-preview')).toContainText('الشريط مش هيظهر');
});

test('غلق الكل: لو رفضت التأكيد مبيتحفظش حاجة', async ({ page }) => {
  const { writes } = await setUp(page, ROWS);
  page.once('dialog', (d) => void d.dismiss());
  await page.getByTestId('bar-close-all').click();
  await page.waitForTimeout(500);
  expect(writes).toHaveLength(0);
  await expect(page.getByTestId('category-bar-row').first().locator('input[type="checkbox"]')).toBeChecked();
});

test('فتح الكل: بيفتح كل التصنيفات و«كل الكتب» من غير سؤال', async ({ page }) => {
  const { writes } = await setUp(page, ROWS.map((r) => ({ ...r, is_visible: false })), false);
  await page.getByTestId('bar-open-all').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes.find((w) => w.table === 'category_bar_items')!.body.every((r: { is_visible: boolean }) => r.is_visible)).toBe(true);
  expect(writes.find((w) => w.table === 'site_content_settings')!.body).toEqual({ all_books_in_bar: true });
});

test('الزرارين بيتقفلوا لما مفيش لزوم: كله مقفول = غلق الكل مقفول، كله مفتوح = فتح الكل مقفول', async ({ page }) => {
  await setUp(page, ROWS.map((r) => ({ ...r, is_visible: false })), false);
  await expect(page.getByTestId('bar-close-all')).toBeDisabled();
  await expect(page.getByTestId('bar-open-all')).toBeEnabled();
});
