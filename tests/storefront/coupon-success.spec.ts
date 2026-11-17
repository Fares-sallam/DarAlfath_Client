import { test, expect, type Page } from '../fixtures';
import { fillCheckoutSteps, signIn } from './helpers';

// The coupon check is the validate-coupon function. It is answered here, not by the real one, so these tests do not depend on
// which coupons happen to be switched on in the live database (DARALFATH20 is now off there, and a test must not switch a real
// coupon on). Everything else is the real store: the real book, the real checkout, the real prices and totals.

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

/** Prices are drawn with a currency symbol (and maybe Arabic digits): the number in a line of the summary. */
const money = (text: string | null) =>
  Number((text ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d.]/g, ''));

async function toCouponStep(page: Page) {
  await signIn(page);
  // The coupon needs an order of at least 100: the dearest book that goes straight in from its card.
  await page.goto('/books?sort=price-desc');
  const add = page.locator('article.book-card .book-card__main', { hasText: 'أضف للسلة' }).first();
  await expect(add).toBeVisible({ timeout: 20_000 });
  await add.click();

  await page.goto('/checkout');
  // Prices and country settle right after arrival; an applied coupon made
  // before that would be dropped (as it should be when the cart changes).
  await page.waitForLoadState('networkidle');
  await fillCheckoutSteps(page);
  const couponInput = page.getByPlaceholder('أدخل كود الخصم');
  await expect(couponInput).toBeVisible({ timeout: 15_000 });
  return couponInput;
}

test('كوبون خصم صحيح (DARALFATH20) يُطبَّق ويقلّل الإجمالي بقيمة الخصم', async ({ page }) => {
  let asked: { code?: string; subtotal?: number } = {};
  await page.route('**/functions/v1/validate-coupon', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    asked = route.request().postDataJSON();
    const amount = Math.round(Number(asked.subtotal) * 0.2 * 100) / 100;
    return route.fulfill({
      status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({ valid: true, couponId: 'test-coupon', discount: { type: 'نسبة', value: 20, calculatedAmount: amount, freeShipping: false, description: 'خصم 20%' } }),
    });
  });

  const couponInput = await toCouponStep(page);
  const totalBefore = money(await page.locator('.order-summary__total b').textContent());
  await couponInput.fill('DARALFATH20');
  const applyButton = page.getByRole('button', { name: 'تطبيق' });
  await expect(applyButton).toBeEnabled({ timeout: 10_000 });
  await applyButton.click();

  // نستهدف شارة الكوبون المُطبَّق تحديدًا — "خصم 20%" يتكرر أيضًا في سطر ملخص
  // الطلب، فالنص وحده غير كافٍ للتمييز.
  await expect(page.locator('.coupon-applied__code')).toHaveText('DARALFATH20', { timeout: 10_000 });
  await expect(page.locator('.coupon-applied__desc')).toHaveText('خصم 20%');
  expect(asked.code).toBe('DARALFATH20'); // the code goes up in capitals, with the real subtotal of the cart
  expect(Number(asked.subtotal)).toBeGreaterThanOrEqual(100);

  // the total goes down by exactly the discount shown in the summary
  const discount = money(await page.locator('.order-summary__discount b').textContent());
  expect(discount).toBeGreaterThan(0);
  await expect.poll(async () => money(await page.locator('.order-summary__total b').textContent())).toBeCloseTo(totalBefore - discount, 1);
});

test('كوبون مقفول أو غير صالح: رسالة واضحة وما بيتطبقش ولا بيغيّر الإجمالي', async ({ page }) => {
  await page.route('**/functions/v1/validate-coupon', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ valid: false, error: 'كود الخصم غير صالح.' }) }));

  const couponInput = await toCouponStep(page);
  const totalBefore = await page.locator('.order-summary__total b').textContent();
  await couponInput.fill('DARALFATH20');
  await page.getByRole('button', { name: 'تطبيق' }).click();

  await expect(page.getByText('كود الخصم غير صالح.')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.coupon-applied')).toHaveCount(0);
  await expect(page.locator('.order-summary__discount')).toHaveCount(0);
  await expect(page.locator('.order-summary__total b')).toHaveText(totalBefore ?? '');
});
