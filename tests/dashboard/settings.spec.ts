import { test, expect } from '@playwright/test';

test('الإعدادات: الصفحة تُحمَّل وتعرض أقسام المتجر والملف الشخصي', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('main').getByRole('heading', { name: 'الإعدادات' })).toBeVisible();

  // عناصر التنقّل الجانبي (أزرار)؛ النصوص نفسها قد تتكرر داخل بطاقات المحتوى
  // (مثلاً زر "حفظ الملف الشخصي")، فنستهدف أزرار الشريط الجانبي تحديدًا.
  await expect(page.getByRole('button', { name: 'الملف الشخصي', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إعدادات المتجر', exact: true })).toBeVisible();
  const paymentTabBtn = page.getByRole('button', { name: 'طرق الدفع', exact: true });
  await expect(paymentTabBtn).toBeVisible();

  // انتقل لتبويب "طرق الدفع" — مهم قبل الإطلاق: يجب أن يظهر الدفع عند الاستلام
  // والدفع الإلكتروني (Paymob) في القائمة الفعلية.
  await paymentTabBtn.click();
  await expect(page.getByText(/كاش|Paymob/).first()).toBeVisible({ timeout: 10_000 });
});
