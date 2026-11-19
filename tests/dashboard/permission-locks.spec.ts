import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner, OWNER_EMAIL } from '../support/fakeOwner';

// The padlock beside each sidebar entry: open when the signed-in person may enter that page, closed when not.
// Entering a closed page still shows the same «غير مسموح لك بالدخول» screen. Hermetic: no real sign-in, every
// Supabase call is answered here.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const NO_PERMISSIONS = {
  can_manage_products: false, can_manage_orders: false, can_manage_users: false, can_manage_admins: false,
  can_manage_inventory: false, can_manage_coupons: false, can_manage_shipping: false, can_view_analytics: false,
  can_export: false, can_view_activity_log: false, can_manage_settings: false,
  can_manage_home_media: false, can_manage_appearance: false, can_manage_links_page: false,
};

async function signInAsStaff(page: Page, granted: Record<string, boolean>) {
  await signInAsFakeOwner(page, 'staff@example.com');
  // registered after the fake owner's catch-all, so it answers first
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fallback();
    // maybeSingle() reads an array and takes the first row; single() asks for one object
    const answer = (row: unknown) => json(route, wantsObject ? row : [row]);
    if (req.url().includes('/rest/v1/profiles')) {
      return answer({ id: '11111111-1111-4111-8111-111111111111', full_name: 'Staff', role: 'manager', avatar_url: null, is_active: true });
    }
    if (req.url().includes('/rest/v1/admin_settings')) {
      return answer({ country_id: null, ...NO_PERMISSIONS, ...granted });
    }
    return route.fallback();
  });
}

const lock = (page: Page, id: string) => page.getByTestId(`nav-lock-${id}`);

test('a supervisor sees an open padlock only on the pages they may enter', async ({ page }) => {
  await signInAsStaff(page, { can_manage_home_media: true, can_manage_orders: true });
  await page.goto('/');

  for (const id of ['hero-slides', 'intro-videos', 'orders', 'payments']) {
    await expect(lock(page, id), id).toHaveAttribute('data-locked', 'false');
  }
  for (const id of ['ads-strips', 'appearance', 'links-page', 'books', 'customers', 'admins', 'settings']) {
    await expect(lock(page, id), id).toHaveAttribute('data-locked', 'true');
  }
  await expect(lock(page, 'home')).toHaveAttribute('data-locked', 'false');
});

test('the ads/strips and the store look share one permission; the links page has its own', async ({ page }) => {
  await signInAsStaff(page, { can_manage_appearance: true });
  await page.goto('/');
  await expect(lock(page, 'ads-strips')).toHaveAttribute('data-locked', 'false');
  await expect(lock(page, 'appearance')).toHaveAttribute('data-locked', 'false');
  await expect(lock(page, 'links-page')).toHaveAttribute('data-locked', 'true');
  await expect(lock(page, 'hero-slides')).toHaveAttribute('data-locked', 'true');
  await expect(lock(page, 'intro-videos')).toHaveAttribute('data-locked', 'true');
});

test('a closed page still shows the usual refusal, an open one loads', async ({ page }) => {
  // can_manage_products no longer opens these pages
  await signInAsStaff(page, { can_manage_links_page: true, can_manage_products: true });

  await page.goto('/hero-slides');
  await expect(page.getByText('غير مسموح لك بالدخول')).toBeVisible();
  await page.goto('/appearance');
  await expect(page.getByText('غير مسموح لك بالدخول')).toBeVisible();
  await page.goto('/links-page');
  await expect(lock(page, 'links-page')).toHaveAttribute('data-locked', 'false');
  await expect(page.getByText('غير مسموح لك بالدخول')).toHaveCount(0);

  // books and series still follow can_manage_products
  await page.goto('/books');
  await expect(lock(page, 'books')).toHaveAttribute('data-locked', 'false');
  await expect(lock(page, 'series')).toHaveAttribute('data-locked', 'false');
  await expect(page.getByText('غير مسموح لك بالدخول')).toHaveCount(0);
});

test('the owner has every padlock open', async ({ page }) => {
  await signInAsFakeOwner(page, OWNER_EMAIL);
  await page.goto('/');
  await expect(lock(page, 'links-page')).toHaveAttribute('data-locked', 'false');
  await expect(lock(page, 'admins')).toHaveAttribute('data-locked', 'false');
  await expect(page.locator('[data-locked="true"]')).toHaveCount(0);
});
