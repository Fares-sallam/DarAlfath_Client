import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «إعدادات المشرفين»: the three content permissions (home media, ads/strips + store look, links page) are listed,
// can be switched and are saved on the supervisor's row. Hermetic: no real sign-in, nothing reaches the database.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const COUNTRY = { id: 'c1', name: 'مصر', code: 'EG', currency: 'EGP', currency_symbol: 'ج.م' };

const ROW = {
  id: 'setting-1', user_id: 'u-1', country_id: 'c1', created_at: '2026-01-01T00:00:00Z',
  can_manage_products: true, can_manage_orders: false, can_manage_users: false, can_manage_admins: false,
  can_manage_inventory: false, can_manage_coupons: false, can_manage_shipping: false, can_view_analytics: false,
  can_export: false, can_view_activity_log: false, can_manage_settings: false,
  can_manage_home_media: true, can_manage_appearance: false, can_manage_links_page: false,
  profiles: { id: 'u-1', full_name: 'Staff Person', email: 'staff@example.com', phone: null, role: 'manager', avatar_url: null, is_active: true, created_at: '2026-01-01T00:00:00Z' },
  countries: COUNTRY,
};

async function setUp(page: Page) {
  const patches: any[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const get = req.method() === 'GET' || req.method() === 'HEAD';
    if (url.includes('/rest/v1/admin_settings')) {
      if (get) return json(route, [ROW]);
      patches.push({ method: req.method(), body: req.postDataJSON() });
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.includes('/rest/v1/admin_country_access') && get) {
      return json(route, [{ id: 'a1', user_id: 'u-1', country_id: 'c1', is_primary: true, countries: COUNTRY }]);
    }
    if (url.includes('/rest/v1/countries') && get) return json(route, [COUNTRY]);
    return route.fallback();
  });
  return patches;
}

test('the three content permissions are listed under their own section and saved on the row', async ({ page }) => {
  const patches = await setUp(page);
  await page.goto('/admins');

  await page.getByRole('main').getByText('Staff Person').first().click();

  await expect(page.getByRole('main').getByText('مظهر المتجر والصفحات')).toBeVisible();
  for (const label of ['صور الصفحة الرئيسية والفيديوهات', 'الإعلانات والأشرطة ومظهر المتجر', 'إدارة الصفحة والروابط']) {
    await expect(page.getByRole('main').getByText(label, { exact: true })).toBeVisible();
  }

  // the stored values show: home media is on, the other two off
  const row = (label: string) => page.getByRole('main').locator('label', { hasText: label });
  await expect(row('صور الصفحة الرئيسية والفيديوهات').locator('svg').first()).toBeVisible();
  await expect(row('الإعلانات والأشرطة ومظهر المتجر').locator('svg')).toHaveCount(0);

  // switch ads/strips + look on and the links page on, home media off, then save
  await row('الإعلانات والأشرطة ومظهر المتجر').locator('button').click();
  await row('إدارة الصفحة والروابط').locator('button').click();
  await row('صور الصفحة الرئيسية والفيديوهات').locator('button').click();
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();

  await expect.poll(() => patches.length).toBeGreaterThan(0);
  const body = patches[0].body;
  expect(patches[0].method).toBe('PATCH');
  expect(body.can_manage_appearance).toBe(true);
  expect(body.can_manage_links_page).toBe(true);
  expect(body.can_manage_home_media).toBe(false);
  expect(body.can_manage_products).toBe(true); // untouched
});

test('the section switch turns the three content permissions on together', async ({ page }) => {
  const patches = await setUp(page);
  await page.goto('/admins');
  await page.getByRole('main').getByText('Staff Person').first().click();

  await page.getByRole('button', { name: 'مظهر المتجر والصفحات' }).click();
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();

  await expect.poll(() => patches.length).toBeGreaterThan(0);
  expect(patches[0].body.can_manage_home_media).toBe(true);
  expect(patches[0].body.can_manage_appearance).toBe(true);
  expect(patches[0].body.can_manage_links_page).toBe(true);
});
