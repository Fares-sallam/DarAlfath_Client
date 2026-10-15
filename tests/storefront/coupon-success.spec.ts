import { test, expect } from '../fixtures';
import { fillCheckoutSteps, signIn } from './helpers';

test('كوبون خصم صحيح (DARALFATH20) يُطبَّق ويقلّل الإجمالي', async ({ page }) => {
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
  await couponInput.fill('DARALFATH20');
  const applyButton = page.getByRole('button', { name: 'تطبيق' });
  await expect(applyButton).toBeEnabled({ timeout: 10_000 });
  await applyButton.click();

  // نستهدف شارة الكوبون المُطبَّق تحديدًا — "خصم 20%" يتكرر أيضًا في سطر ملخص
  // الطلب، فالنص وحده غير كافٍ للتمييز.
  await expect(page.locator('.coupon-applied__code')).toHaveText('DARALFATH20', { timeout: 10_000 });
  await expect(page.locator('.coupon-applied__desc')).toHaveText('خصم 20%');
});
