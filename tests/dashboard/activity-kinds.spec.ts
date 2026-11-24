import { readFile } from 'node:fs/promises';
import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «سجل النشاط» is two logs: the staff's (and the system's) and the customers'. Hermetic: no real sign-in, the view
// `audit_logs_by_kind` is answered here (each kind its own rows) and every request to it is recorded.

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
  row('c1', { user_id: 'u-customer', user_email: 'customer@example.test', actor_name: 'عميل جديد', actor_role: 'user', table_name: 'profiles',
    old_data: { phone: null }, new_data: { phone: '01000000000' } }),
  row('c2', { action: 'INSERT', table_name: 'profiles', record_id: 'c2-signup-record' }), // the customer's signup, written by the system
  row('c3', { action: 'INSERT', table_name: 'orders' }),
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

test('سجل النشاط: بيفتح على المشرفين والنظام، وتبويب العملاء بيجيب سجل العملاء بس', async ({ page }) => {
  const asked = await setUp(page);
  await page.goto('/activity');

  const staffTab = page.getByTestId('activity-tab-staff');
  const customerTab = page.getByTestId('activity-tab-customer');
  await expect(staffTab).toHaveAttribute('aria-selected', 'true');
  await expect(customerTab).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('tbody tr.table-row')).toHaveCount(2);
  await expect(page.getByText('Staff Member')).toBeVisible();
  await expect(page.getByText('النظام', { exact: true })).toBeVisible();
  await expect(page.getByText('عميل جديد')).toHaveCount(0);
  expect(new Set(kindsAsked(asked))).toEqual(new Set(['staff']));

  await customerTab.click();
  await expect(customerTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/kind=customer/);
  await expect(page.locator('tbody tr.table-row')).toHaveCount(3);
  await expect(page.getByText('عميل جديد')).toBeVisible();
  await expect(page.getByText('Staff Member')).toHaveCount(0);
  expect(kindsAsked(asked).at(-1)).toBe('customer');

  // and back to the staff's log
  await staffTab.click();
  await expect(staffTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).not.toHaveURL(/kind=/);
  await expect(page.locator('tbody tr.table-row')).toHaveCount(2);
  await expect(page.getByText('Staff Member')).toBeVisible();
  await expect(page.getByText('عميل جديد')).toHaveCount(0);
  // each log is asked for once (the page keeps what it already loaded), and never the other kind's rows
  expect(new Set(kindsAsked(asked))).toEqual(new Set(['staff', 'customer']));
});

test('سجل النشاط: الرابط ?kind=customer بيفتح سجل العملاء مباشرة، والفلاتر بتتصفّر لما تبدّل', async ({ page }) => {
  const asked = await setUp(page);
  await page.goto('/activity?kind=customer');

  await expect(page.getByTestId('activity-tab-customer')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('tbody tr.table-row')).toHaveCount(3);
  expect(new Set(kindsAsked(asked))).toEqual(new Set(['customer']));
  await expect(page.getByTestId('activity-kind-hint')).toContainText('تسجيل العملاء');

  // a filter picked in one log is not carried into the other
  await page.getByTestId('activity-tab-customer').click(); // already there: nothing changes
  await page.getByPlaceholder(/ابحث بالمستخدم/).fill('عميل');
  await expect(page.locator('tbody tr.table-row')).toHaveCount(1);
  await page.getByTestId('activity-tab-staff').click();
  await expect(page.getByPlaceholder(/ابحث بالمستخدم/)).toHaveValue('');
  await expect(page.locator('tbody tr.table-row')).toHaveCount(2);
  await expect(page.getByTestId('activity-kind-hint')).toContainText('المشرفين');
});

for (const { path, kind, title, file, present, absent } of [
  { path: '/activity', kind: 'المشرفين', title: 'تقرير سجل نشاط المشرفين', file: 'تقرير-سجل-نشاط-المشرفين', present: 'Staff Member', absent: 'عميل جديد' },
  { path: '/activity?kind=customer', kind: 'العملاء', title: 'تقرير سجل نشاط العملاء', file: 'تقرير-سجل-نشاط-العملاء', present: 'عميل جديد', absent: 'Staff Member' },
]) {
  test(`سجل النشاط: تقرير ${kind} فيه سجله بس وباسمه`, async ({ page }) => {
    await setUp(page);
    await page.goto(path);
    await expect(page.locator('tbody tr.table-row').first()).toBeVisible();

    await page.getByRole('button', { name: 'تنزيل تقرير' }).click();
    const panel = page.getByRole('dialog');
    await panel.getByRole('button', { name: 'شامل', exact: true }).click();
    await panel.getByRole('radio', { name: /CSV/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      panel.getByRole('button', { name: 'تنزيل التقرير' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^${file}_شامل_تنزيل-`));
    const text = (await readFile((await download.path())!)).toString('utf8');
    expect(text).toContain(`"${title}"`);
    expect(text).toContain(present);
    expect(text).not.toContain(absent);
  });
}
