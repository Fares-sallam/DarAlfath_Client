import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// The home page's activity panel is split like «سجل النشاط»: one tab for the staff and the system, one for the customers. Hermetic: no real
// sign-in, the view `audit_logs_by_kind` is answered here (each kind its own rows) and every request to it is recorded.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: null, user_email: null, action: 'UPDATE', table_name: 'products', record_id: `${id}-record-0000`, old_data: null, new_data: null,
  ip_address: null, created_at: '2026-11-24T09:00:00Z', actor_name: null, actor_avatar: null, actor_role: null, ...over,
});

const STAFF = [
  row('s1', { user_id: 'u-admin', user_email: 'staff@example.test', actor_name: 'Staff Member', actor_role: 'admin', table_name: 'product_inventory' }),
  row('s2', { table_name: 'payment_methods' }), // no actor: the system
];
const CUSTOMERS = [
  row('c1', { action: 'INSERT', table_name: 'profiles', user_id: 'u-customer', user_email: 'customer@example.test', actor_name: 'عميل جديد', actor_role: 'user' }),
  row('c2', { action: 'INSERT', table_name: 'orders', actor_name: 'Test Guest (ضيف)' }), // a guest: a name, no account
];

async function setUp(page: Page) {
  const asked: string[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/audit_logs_by_kind**', (route) => {
    const url = route.request().url();
    asked.push(url);
    return json(route, url.includes('actor_kind=eq.customer') ? CUSTOMERS : url.includes('actor_kind=eq.staff') ? STAFF : []);
  });
  return asked;
}

const kindsAsked = (asked: string[]) => asked.map((u) => /actor_kind=eq\.(\w+)/.exec(u)?.[1]);

test('الرئيسية: «سجل التعديلات» بيفتح على المشرفين والنظام، وتبويب العملاء بيعرض العملاء بس', async ({ page }) => {
  const asked = await setUp(page);
  await page.goto('/');

  const staffTab = page.getByTestId('home-activity-tab-staff');
  const customerTab = page.getByTestId('home-activity-tab-customer');
  await expect(staffTab).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
  await expect(customerTab).toHaveAttribute('aria-selected', 'false');
  const rows = page.getByTestId('home-activity-row');
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('Staff Member')).toBeVisible();
  await expect(page.getByText('عميل جديد')).toHaveCount(0);
  expect(new Set(kindsAsked(asked))).toEqual(new Set(['staff']));

  await customerTab.click();
  await expect(customerTab).toHaveAttribute('aria-selected', 'true');
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('عميل جديد')).toBeVisible();
  // a guest's own name is the actor, not «النظام»
  await expect(page.getByText('Test Guest (ضيف)')).toBeVisible();
  await expect(page.getByText('Staff Member')).toHaveCount(0);
  await expect(page.getByTestId('home-activity-hint')).toContainText('العملاء');
  expect(kindsAsked(asked).at(-1)).toBe('customer');

  await staffTab.click();
  await expect(staffTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Staff Member')).toBeVisible();
  await expect(page.getByText('Test Guest (ضيف)')).toHaveCount(0);
});

test('الرئيسية: «عرض الكل» وضغطة على صف بيفتحوا سجل النشاط على نفس النوع', async ({ page }) => {
  await setUp(page);
  await page.goto('/');
  await expect(page.getByTestId('home-activity-tab-staff')).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });

  await page.getByTestId('home-activity-all').click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByTestId('activity-tab-staff')).toHaveAttribute('aria-selected', 'true');

  await page.goto('/');
  await page.getByTestId('home-activity-tab-customer').click();
  await page.getByTestId('home-activity-all').click();
  await expect(page).toHaveURL(/\/activity\?kind=customer/);
  await expect(page.getByTestId('activity-tab-customer')).toHaveAttribute('aria-selected', 'true');

  await page.goto('/');
  await page.getByTestId('home-activity-tab-customer').click();
  await page.getByTestId('home-activity-row').first().click();
  await expect(page).toHaveURL(/\/activity\?kind=customer/);
});

test('الرئيسية: تبويب من غير عمليات بيقول ده بوضوح بدل لوحة فاضية', async ({ page }) => {
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/audit_logs_by_kind**', (route) =>
    json(route, route.request().url().includes('actor_kind=eq.staff') ? STAFF : []));
  await page.goto('/');
  await page.getByTestId('home-activity-tab-customer').click({ timeout: 20_000 });
  await expect(page.getByText('لا توجد عمليات للعملاء بعد')).toBeVisible();
  await expect(page.getByTestId('home-activity-row')).toHaveCount(0);
});
