import { test, expect, type Route } from '../fixtures';

// Ordering the series from the dashboard: the order here is the storefront's top menu and home page.
// The list is answered in flight (three series that all start at sort_order 0, as the real ones did) and
// every write is recorded and answered here instead of reaching the database.

interface Write { method: string; url: string; body: unknown }

const rows = ['الأولى', 'الثانية', 'الثالثة'].map((name, i) => ({
  id: `00000000-0000-0000-0000-00000000000${i + 1}`,
  name, description: null, cover_url: null, author: null, year: null,
  sort_order: 0, is_active: true, total_sales: 0, created_at: `2026-08-31T10:0${i}:00Z`,
  product_series: [],
}));

const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test('ترتيب السلاسل: تقديم وتأخير بيتحفظوا كأرقام ترتيب، والتحريك متقفل مع البحث', async ({ page }) => {
  const writes: Write[] = [];
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.fallback();
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    writes.push({ method: req.method(), url: req.url(), body });
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, body: '' });
  });
  await page.route('**/rest/v1/book_series*', (route) => (route.request().method() === 'GET' ? json(route, rows) : route.fallback()));

  await page.goto('/series');
  const cards = page.locator('[data-testid="series-position"]');
  await expect(cards).toHaveCount(3, { timeout: 20_000 });
  await expect(cards).toHaveText(['#1', '#2', '#3']);
  await expect(page.getByTestId('series-order-hint')).toContainText('القائمة العلوية');

  // The first can't go earlier, the last can't go later.
  await expect(page.getByTestId('series-move-earlier').first()).toBeDisabled();
  await expect(page.getByTestId('series-move-later').last()).toBeDisabled();

  // Third → second place: renumbered 0, 1, 2 in the new order; the one already at 0 isn't written.
  await page.getByRole('button', { name: 'تقديم الثالثة' }).click();
  await expect.poll(() => writes.filter((w) => w.url.includes('book_series')).length).toBe(2);
  const patches = writes.filter((w) => w.url.includes('book_series'));
  expect(patches.every((w) => w.method === 'PATCH')).toBe(true);
  const byId = Object.fromEntries(patches.map((w) => [decodeURIComponent(w.url).match(/id=eq\.([0-9a-f-]+)/)![1], (w.body as { sort_order: number }).sort_order]));
  expect(byId).toEqual({ [rows[2].id]: 1, [rows[1].id]: 2 });

  // With a search on, a neighbour on screen isn't a neighbour in the menu: no moving.
  await page.getByPlaceholder('ابحث باسم السلسلة أو المؤلف...').fill('الثانية');
  await expect(page.getByTestId('series-move-earlier')).toBeDisabled();
  await expect(page.getByTestId('series-move-later')).toBeDisabled();
  await expect(page.getByTestId('series-order-hint')).toContainText('امسح البحث');
});
