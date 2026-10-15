import { test, expect, type Route } from '../fixtures';

// An order placed without an account shows the buyer's name and number from the order, marked "زائر".
// The first order of the real list is shown as a guest's (rewritten in flight); nothing is written.

test('إدارة الطلبات: طلب الزائر عليه علامة «زائر» وباسمه ورقمه من بيانات الطلب', async ({ page }) => {
  await page.route('**/rest/v1/**', (route: Route) => {
    const method = route.request().method();
    return method === 'GET' || method === 'HEAD' ? route.fallback() : route.abort();
  });
  await page.route('**/rest/v1/orders?*', async (route: Route) => {
    if (route.request().method() !== 'GET' || (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')) return route.fallback();
    const response = await route.fetch();
    const rows = (await response.json()) as Record<string, unknown>[];
    if (Array.isArray(rows) && rows.length) {
      rows[0] = {
        ...rows[0],
        user_id: null,
        profiles: null,
        shipping_address: { ...(rows[0].shipping_address as object), name: 'ضيف بلا حساب', phone: '01098765432', email: '' },
      };
    }
    return route.fulfill({ response, json: rows });
  });
  await page.goto('/orders');
  const row = page.locator('tr', { hasText: 'ضيف بلا حساب' }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText('زائر', { exact: true })).toBeVisible();
  await expect(row).toContainText('01098765432');
});
