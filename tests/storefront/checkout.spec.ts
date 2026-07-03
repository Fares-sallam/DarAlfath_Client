import { test, expect } from '@playwright/test';

/**
 * يضيف كتابًا للسلة ويكمل الدفع كضيف (عند الاستلام). يستخدم إيميلاً موسومًا
 * بوضوح (playwright-e2e+...) لسهولة تنظيف الطلب التجريبي لاحقًا من لوحة التحكم.
 * يتطلب أن يكون هناك مخزون كافٍ لأول منتج في الكتالوج.
 */
test('عميل ضيف يضيف كتابًا للسلة ويكمل الدفع عند الاستلام (COD)', async ({ page }) => {
  await page.goto('/');

  const firstBook = page.getByRole('button', { name: /^فتح صفحة/ }).first();
  await expect(firstBook).toBeVisible({ timeout: 15_000 });
  await firstBook.click();

  await page.waitForURL(/\/book\//);
  // يجب اختيار نسخة (ورقي/رقمي) أولًا — قبل ذلك يظهر زر معطّل "اختر نسخة أولًا".
  await page.getByRole('button', { name: /متوفر \d+ نسخة/ }).first().click();
  const addToCart = page.getByRole('button', { name: 'أضف إلى السلة' });
  await expect(addToCart).toBeEnabled({ timeout: 10_000 });
  await addToCart.click();

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'إتمام الطلب' }).or(page.getByText('بيانات العميل'))).toBeVisible();

  const stamp = Date.now();
  await page.getByPlaceholder('الاسم الثلاثي كاملاً *').fill('Playwright كلود تست');
  await page.getByPlaceholder('البريد الإلكتروني *').fill(`playwright-e2e+${stamp}@daralfath.test`);
  await page.getByPlaceholder('رقم الهاتف *').fill('01011122233');

  // نقصر البحث عن select على بطاقة عنوان الشحن — الهيدر فيه select لاختيار الدولة أيضًا.
  const shippingCard = page.locator('.contact-card', { hasText: 'عنوان الشحن' });
  await shippingCard.locator('select').nth(0).selectOption('القاهرة'); // المحافظة
  await shippingCard.locator('select').nth(1).selectOption('القاهرة'); // المدينة
  await page.getByPlaceholder('الشارع والعنوان بالتفصيل *').fill('شارع اختبار Playwright، مبنى 1');

  // اختيار الدفع عند الاستلام (COD) صراحةً.
  await page.getByText('الدفع عند الاستلام').click();

  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();

  await expect(page.getByText('تم إرسال الطلب بنجاح')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^ORD-/)).toBeVisible();
});

test('كود خصم غير موجود يعرض رسالة خطأ عربية واضحة', async ({ page }) => {
  await page.goto('/');
  const firstBook = page.getByRole('button', { name: /^فتح صفحة/ }).first();
  await expect(firstBook).toBeVisible({ timeout: 15_000 });
  await firstBook.click();

  await page.waitForURL(/\/book\//);
  // يجب اختيار نسخة (ورقي/رقمي) أولًا — قبل ذلك يظهر زر معطّل "اختر نسخة أولًا".
  await page.getByRole('button', { name: /متوفر \d+ نسخة/ }).first().click();
  const addToCart = page.getByRole('button', { name: 'أضف إلى السلة' });
  await expect(addToCart).toBeEnabled({ timeout: 10_000 });
  await addToCart.click();

  await page.goto('/checkout');
  await page.waitForLoadState('networkidle');
  const couponInput = page.getByPlaceholder('أدخل كود الخصم');
  await expect(couponInput).toBeVisible({ timeout: 10_000 });
  await couponInput.fill('THIS-CODE-DOES-NOT-EXIST');
  const applyButton = page.getByRole('button', { name: 'تطبيق' });
  await expect(applyButton).toBeEnabled({ timeout: 10_000 });
  await applyButton.click();

  await expect(page.getByText('كود الخصم غير صالح.')).toBeVisible({ timeout: 10_000 });
});
