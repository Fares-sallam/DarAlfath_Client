import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «إدارة السلاسل»: ترتيب الكتب جوه السلسلة بعد إصلاح الأرقام المتساوية، وترتيب السلسلة الجديدة، وإخفاء عدّاد المبيعات الميت.
// Hermetic: no real sign-in, nothing reaches the database (every call is answered here, writes are only recorded).

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const book = (id: string, title: string) => ({
  product_id: id,
  series_id: 's1',
  sort_order: 0, // the state the live data was in: every book had 0
  products: { id, title, author: 'مؤلف', cover_url: null, type: 'ورقي', is_active: true, base_price: 10, sale_price: null },
});

const SERIES_ROW = {
  id: 's1', name: 'سلسلة تجريبية', description: null, cover_url: null, author: null, year: null,
  sort_order: 0, is_active: true, total_sales: 12345, created_at: '2026-01-01T00:00:00Z',
  product_series: [{ product_id: 'p1' }, { product_id: 'p2' }, { product_id: 'p3' }],
};

interface Write { method: string; url: string; body: any }

async function setUp(page: Page) {
  const writes: Write[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const get = req.method() === 'GET' || req.method() === 'HEAD';

    if (url.includes('/rest/v1/book_series')) {
      if (get) {
        // the "last sort_order" lookup made when a series is created
        if (/select=sort_order(&|$)/.test(url)) return json(route, [{ sort_order: 7 }]);
        return json(route, [SERIES_ROW]);
      }
      writes.push({ method: req.method(), url, body: req.postDataJSON() });
      return route.fulfill({ status: 201, body: '' });
    }
    if (url.includes('/rest/v1/product_series')) {
      if (get) return json(route, [book('p1', 'كتاب أ'), book('p2', 'كتاب ب'), book('p3', 'كتاب ج')]);
      writes.push({ method: req.method(), url, body: req.postDataJSON() });
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
  return writes;
}

async function openBooks(page: Page) {
  await page.goto('/series');
  await expect(page.getByRole('main').getByText('سلسلة تجريبية').first()).toBeVisible();
  await page.getByRole('button', { name: /3\s*كتاب/ }).first().click();
  await expect(page.getByText('كتاب أ')).toBeVisible();
}

test('تحريك كتاب لأعلى لما كل الأرقام 0: بيترقّم الباقي ولا يتحرك شيء من غير فايدة', async ({ page }) => {
  const writes = await setUp(page);
  await openBooks(page);

  // third book up: order becomes أ، ج، ب. أ keeps 0 (no write), ج gets 1 and ب gets 2.
  await page.getByTitle('تحريك لأعلى').nth(2).click();
  await expect.poll(() => writes.filter((w) => w.method === 'PATCH').length).toBe(2);

  const patches = writes.filter((w) => w.method === 'PATCH');
  const byProduct = Object.fromEntries(patches.map((w) => [/product_id=eq\.([^&]+)/.exec(w.url)?.[1], w.body.sort_order]));
  expect(byProduct).toEqual({ p3: 1, p2: 2 });
});

test('تحريك كتاب لأسفل: نفس الترقيم', async ({ page }) => {
  const writes = await setUp(page);
  await openBooks(page);

  // first book down: order becomes ب، أ، ج. ب gets 0 (was 0, no write), أ gets 1, ج stays 2 vs its 0 → written.
  await page.getByTitle('تحريك لأسفل').nth(0).click();
  await expect.poll(() => writes.filter((w) => w.method === 'PATCH').length).toBe(2);

  const patches = writes.filter((w) => w.method === 'PATCH');
  const byProduct = Object.fromEntries(patches.map((w) => [/product_id=eq\.([^&]+)/.exec(w.url)?.[1], w.body.sort_order]));
  expect(byProduct).toEqual({ p1: 1 , p3: 2 });
});

test('عدّاد «نسخة مباعة» الميت اتشال، وبطاقة «سلاسل غير نشطة» بدل «إجمالي المبيعات»', async ({ page }) => {
  await setUp(page);
  await page.goto('/series');
  await expect(page.getByRole('main').getByText('سلسلة تجريبية').first()).toBeVisible();

  await expect(page.getByText('نسخة مباعة')).toHaveCount(0);
  await expect(page.getByText('إجمالي المبيعات')).toHaveCount(0);
  await expect(page.getByText('12,345')).toHaveCount(0);
  await expect(page.getByText('سلاسل غير نشطة')).toBeVisible();
});

test('سلسلة جديدة بتروح آخر القايمة (آخر رقم + 1) بدل 0', async ({ page }) => {
  const writes = await setUp(page);
  await page.goto('/series');
  await expect(page.getByRole('main').getByText('سلسلة تجريبية').first()).toBeVisible();

  await page.getByRole('button', { name: /إضافة سلسلة/ }).first().click();
  await page.getByPlaceholder('مثال: سلسلة في رحاب الله').fill('سلسلة جديدة');
  await page.getByRole('button', { name: 'إضافة السلسلة' }).click();

  await expect.poll(() => writes.filter((w) => w.method === 'POST').length).toBeGreaterThan(0);
  const created = writes.find((w) => w.method === 'POST')!;
  expect(created.body.name).toBe('سلسلة جديدة');
  expect(created.body.sort_order).toBe(8);
});
