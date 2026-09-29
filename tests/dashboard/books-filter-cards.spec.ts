import { test, expect, type Page } from '@playwright/test';

// The four counters above the books list are filter buttons. Read-only:
// nothing here changes data.

const card = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^\\d+ ${label}$`) });

const count = async (page: Page, label: string) =>
  Number((await card(page, label).innerText()).split('\n').filter(Boolean)[0]);

const shownBooks = (page: Page) => page.locator('tbody tr').filter({ has: page.getByTitle('تعديل') });

test('كل مربع فوق قائمة الكتب بيعرض بالظبط عدد كتبه، والضغط عليه تاني بيلغيه', async ({ page }) => {
  await page.goto('/books');
  const total = card(page, 'إجمالي الكتب');
  await expect(total).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await expect(shownBooks(page).first()).toBeVisible({ timeout: 15_000 });
  const all = await count(page, 'إجمالي الكتب');
  await expect(shownBooks(page)).toHaveCount(all);

  for (const label of ['غير نشط', 'نشط', 'كتب رقمية']) {
    const n = await count(page, label);
    await card(page, label).click();
    await expect(card(page, label)).toHaveAttribute('aria-pressed', 'true');
    await expect(total).toHaveAttribute('aria-pressed', 'false');
    await expect(shownBooks(page)).toHaveCount(n);
    if (n === 0) await expect(page.getByText('لا توجد كتب').first()).toBeVisible();

    // A second click goes back to everything.
    await card(page, label).click();
    await expect(total).toHaveAttribute('aria-pressed', 'true');
    await expect(shownBooks(page)).toHaveCount(all);
  }
});

test('مربع واحد بس معلّم في المرة، وإجمالي الكتب بيرجّع كل حاجة', async ({ page }) => {
  await page.goto('/books');
  await expect(shownBooks(page).first()).toBeVisible({ timeout: 15_000 });

  await card(page, 'غير نشط').click();
  await card(page, 'نشط').click();
  await expect(card(page, 'نشط')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'غير نشط')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('tbody tr').filter({ has: page.getByTitle('تفعيل') })).toHaveCount(0);

  await card(page, 'إجمالي الكتب').click();
  await expect(card(page, 'إجمالي الكتب')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'نشط')).toHaveAttribute('aria-pressed', 'false');
});

test('المربع بيتزامن مع قايمة الفلترة والعكس', async ({ page }) => {
  await page.goto('/books');
  await expect(shownBooks(page).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^فلترة/ }).click();
  const status = page.locator('select').filter({ has: page.locator('option', { hasText: 'مخفي' }) }).first();

  await card(page, 'غير نشط').click();
  await expect(status).toHaveValue('مخفي');

  await status.selectOption('نشط');
  await expect(card(page, 'نشط')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'غير نشط')).toHaveAttribute('aria-pressed', 'false');
});
