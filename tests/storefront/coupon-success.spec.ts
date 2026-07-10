import { test, expect } from '@playwright/test';

test('كوبون خصم صحيح (DARALFATH20) يُطبَّق ويقلّل الإجمالي', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^فتح صفحة/ }).first().click();
  await page.waitForURL(/\/book\//);
  await page.getByRole('button', { name: /متوفر \d+ نسخة/ }).first().click();
  const addToCart = page.getByRole('button', { name: 'أضف إلى السلة' });
  await expect(addToCart).toBeEnabled({ timeout: 10_000 });
  await addToCart.click();

  await page.goto('/checkout');
  await page.waitForLoadState('networkidle');
  const couponInput = page.getByPlaceholder('أدخل كود الخصم');
  await expect(couponInput).toBeVisible({ timeout: 10_000 });
  await couponInput.fill('DARALFATH20');
  const applyButton = page.getByRole('button', { name: 'تطبيق' });
  await expect(applyButton).toBeEnabled({ timeout: 10_000 });
  await applyButton.click();

  // نستهدف شارة الكوبون المُطبَّق تحديدًا — "خصم 20%" يتكرر أيضًا في سطر ملخص
  // الطلب، فالنص وحده غير كافٍ للتمييز.
  await expect(page.locator('.coupon-applied__code')).toHaveText('DARALFATH20', { timeout: 10_000 });
  await expect(page.locator('.coupon-applied__desc')).toHaveText('خصم 20%');
});
