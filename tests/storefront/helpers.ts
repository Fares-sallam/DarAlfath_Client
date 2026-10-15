import { expect, test, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

/** Buying needs an account, so checkout tests sign in with the E2E test account (from .env.e2e). */
export async function signIn(page: Page) {
  test.skip(!EMAIL || !PASSWORD, 'حساب الاختبار غير مضبوط في .env.e2e');
  await page.goto('/account');
  await page.getByPlaceholder('name@example.com').fill(EMAIL!);
  await page.getByPlaceholder('••••••••').fill(PASSWORD!);
  await page.locator('form.auth-card button[type="submit"]').click();
  await expect(page.getByRole('button', { name: 'تسجيل الخروج' })).toBeVisible({ timeout: 15_000 });
}

/**
 * Opens the first book on the home page and adds it to the cart. A bundle
 * with one copy has that copy pre-selected (no picker), so a copy is only
 * clicked when the page offers a choice.
 */
export async function addFirstBookToCart(page: Page) {
  await page.goto('/');
  const firstBook = page.getByRole('button', { name: /^فتح صفحة/ }).first();
  await expect(firstBook).toBeVisible({ timeout: 15_000 });
  await firstBook.click();
  await page.waitForURL(/\/book\//);

  await page.locator('.bk3-var, .bk3-bundle__item').first().waitFor({ timeout: 15_000 });
  const copy = page.getByRole('button', { name: /متوفر \d+ نسخة/ }).first();
  if (await copy.count()) await copy.click();

  const addToCart = page.getByRole('button', { name: 'أضف إلى السلة' });
  await expect(addToCart).toBeEnabled({ timeout: 10_000 });
  await addToCart.click();
}

/**
 * Goes through checkout's first two steps (details, then address) with test details, ending on the
 * payment step. Nothing is sent: the order is only placed from the payment step.
 */
export async function fillCheckoutSteps(page: Page, details: { name?: string; phone?: string; email?: string } = {}) {
  const step1 = page.getByTestId('checkout-step-1');
  await expect(step1).toBeVisible({ timeout: 15_000 });
  await step1.getByLabel('الاسم ثلاثيًا *').fill(details.name ?? 'محمد أحمد علي');
  await step1.getByLabel('رقم الموبايل *').fill(details.phone ?? '01012345678');
  if (details.email !== undefined) await step1.getByLabel(/^البريد الإلكتروني/).fill(details.email);
  await step1.getByRole('button', { name: /^التالي/ }).click();

  const step2 = page.getByTestId('checkout-step-2');
  await expect(step2).toBeVisible();
  await step2.getByLabel('المحافظة *').selectOption('القاهرة');
  await step2.getByLabel('المدينة *').selectOption('مدينة نصر');
  await step2.getByLabel('العنوان بالتفصيل *').fill('شارع عباس العقاد، عمارة 5');
  await step2.getByRole('button', { name: /^التالي/ }).click();
  await expect(page.getByTestId('checkout-step-3')).toBeVisible();
}
