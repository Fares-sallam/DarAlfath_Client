import { test, expect } from '@playwright/test';
import { addFirstBookToCart, signIn } from './helpers';

// Buying requires an account (guest checkout was removed), and these tests
// run against the live database — so none of them places an order.

test('الزائر بدون حساب يُطلب منه تسجيل الدخول قبل الدفع', async ({ page }) => {
  await addFirstBookToCart(page);
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'سجّل الدخول لإتمام الطلب' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'تأكيد الطلب' })).toHaveCount(0);
});

test('كود خصم غير موجود يعرض رسالة خطأ عربية واضحة', async ({ page }) => {
  await signIn(page);
  await addFirstBookToCart(page);

  await page.goto('/checkout');
  // Prices and country settle right after arrival; an applied coupon made
  // before that would be dropped (as it should be when the cart changes).
  await page.waitForLoadState('networkidle');
  const couponInput = page.getByPlaceholder('أدخل كود الخصم');
  await expect(couponInput).toBeVisible({ timeout: 15_000 });
  await couponInput.fill('THIS-CODE-DOES-NOT-EXIST');
  const applyButton = page.getByRole('button', { name: 'تطبيق' });
  await expect(applyButton).toBeEnabled({ timeout: 10_000 });
  await applyButton.click();

  await expect(page.getByText('كود الخصم غير صالح.')).toBeVisible({ timeout: 10_000 });
});
