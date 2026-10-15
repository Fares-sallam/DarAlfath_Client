import { test, expect } from '../fixtures';
import { addFirstBookToCart, fillCheckoutSteps, signIn } from './helpers';

// These run against the live database, so none of them places an order: the code check is answered by
// the real validate-coupon function, which writes nothing.

test('كود خصم غير موجود يعرض رسالة خطأ عربية واضحة', async ({ page }) => {
  await signIn(page);
  await addFirstBookToCart(page);

  await page.goto('/checkout');
  // Prices and country settle right after arrival; an applied coupon made
  // before that would be dropped (as it should be when the cart changes).
  await page.waitForLoadState('networkidle');
  await fillCheckoutSteps(page);
  const couponInput = page.getByPlaceholder('أدخل كود الخصم');
  await expect(couponInput).toBeVisible({ timeout: 15_000 });
  await couponInput.fill('THIS-CODE-DOES-NOT-EXIST');
  const applyButton = page.getByRole('button', { name: 'تطبيق' });
  await expect(applyButton).toBeEnabled({ timeout: 10_000 });
  await applyButton.click();

  await expect(page.getByText('كود الخصم غير صالح.')).toBeVisible({ timeout: 10_000 });
});
