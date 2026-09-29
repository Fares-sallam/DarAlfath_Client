import { test, expect, type Page } from '@playwright/test';

// The counters above the customers and coupons lists are filter buttons.
// Read-only: nothing here changes data.

const card = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^\\d+ ${label}$`) });
const count = async (page: Page, label: string) => Number((await card(page, label).innerText()).split('\n').filter(Boolean)[0]);

test.describe('العملاء', () => {
  const rows = (page: Page) => page.locator('tbody tr');

  test('كل مربع بيعرض بالظبط عدد عملائه، والضغط عليه تاني بيلغيه', async ({ page }) => {
    await page.goto('/customers');
    const total = card(page, 'إجمالي العملاء');
    await expect(total).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    const all = await count(page, 'إجمالي العملاء');
    await expect(page.getByText(`${all} عميل`, { exact: true })).toBeVisible();

    for (const label of ['العملاء النشطين', 'المحظورون']) {
      const n = await count(page, label);
      await card(page, label).click();
      await expect(card(page, label)).toHaveAttribute('aria-pressed', 'true');
      await expect(total).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByText(`${n} عميل`, { exact: true })).toBeVisible();
      await expect(rows(page)).toHaveCount(n);

      await card(page, label).click();
      await expect(total).toHaveAttribute('aria-pressed', 'true');
      await expect(rows(page)).toHaveCount(all);
    }
  });

  test('النشطين والمحظورين مع بعض بيساووا الإجمالي، والمربع بيتزامن مع القايمة', async ({ page }) => {
    await page.goto('/customers');
    await expect(card(page, 'إجمالي العملاء')).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    expect((await count(page, 'العملاء النشطين')) + (await count(page, 'المحظورون'))).toBe(await count(page, 'إجمالي العملاء'));

    const status = page.locator('select').filter({ has: page.locator('option', { hasText: 'محظور' }) }).first();
    await card(page, 'المحظورون').click();
    await expect(status).toHaveValue('محظور');
    await status.selectOption('نشط');
    await expect(card(page, 'العملاء النشطين')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, 'المحظورون')).toHaveAttribute('aria-pressed', 'false');
  });

  test('إجمالي المشتريات مجموع فلوس مش فئة، فمش زرار', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByText('إجمالي المشتريات')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /إجمالي المشتريات/ })).toHaveCount(0);
  });
});

test.describe('الكوبونات', () => {
  const coupons = (page: Page) => page.locator('.xl\\:grid-cols-3 > *');

  test('كل مربع بيعرض بالظبط عدد كوبوناته، والضغط عليه تاني بيلغيه', async ({ page }) => {
    await page.goto('/coupons');
    await expect(card(page, 'نشط')).toBeVisible({ timeout: 15_000 });
    const statuses = ['نشط', 'منتهي', 'معطل', 'لم يبدأ'];
    const counts = await Promise.all(statuses.map((s) => count(page, s)));
    const all = counts.reduce((a, b) => a + b, 0);
    await expect(page.getByText(`${all} كوبون`, { exact: true })).toBeVisible();

    for (const [i, label] of statuses.entries()) {
      const n = counts[i];
      await card(page, label).click();
      await expect(card(page, label)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText(`${n} كوبون`, { exact: true })).toBeVisible();
      await expect(coupons(page)).toHaveCount(n);
      // Only one status card is selected at a time.
      await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(1);

      await card(page, label).click();
      await expect(page.getByText(`${all} كوبون`, { exact: true })).toBeVisible();
    }
  });

  test('المربع بيتزامن مع قايمة الحالة، وإجمالي الاستخدامات مش زرار', async ({ page }) => {
    await page.goto('/coupons');
    await expect(card(page, 'نشط')).toBeVisible({ timeout: 15_000 });
    const status = page.locator('select').filter({ has: page.locator('option', { hasText: 'لم يبدأ' }) }).first();

    await card(page, 'منتهي').click();
    await expect(status).toHaveValue('منتهي');
    await status.selectOption('نشط');
    await expect(card(page, 'نشط')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, 'منتهي')).toHaveAttribute('aria-pressed', 'false');

    await expect(page.getByText('إجمالي الاستخدامات')).toBeVisible();
    await expect(page.getByRole('button', { name: /إجمالي الاستخدامات/ })).toHaveCount(0);
  });
});
