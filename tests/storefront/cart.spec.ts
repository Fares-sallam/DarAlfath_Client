import { test, expect } from '@playwright/test';
import { addFirstBookToCart } from './helpers';

test.describe('السلة والمفضلة', () => {
  test('إضافة كتاب للسلة، تعديل الكمية، ثم حذفه', async ({ page }) => {
    await addFirstBookToCart(page);

    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'سلة المشتريات' })).toBeVisible();

    const qtyInput = page.locator('input[type="number"]').first();
    if (await qtyInput.count()) {
      await qtyInput.fill('2');
      await qtyInput.blur();
      await expect(qtyInput).toHaveValue('2', { timeout: 5_000 });
    }

    await page.getByLabel('حذف من السلة').first().click();
    await expect(page.getByText('السلة فارغة')).toBeVisible({ timeout: 10_000 });
  });

  test('إضافة كتاب للمفضلة ثم إزالته', async ({ page }) => {
    await page.goto('/');
    const wishlistBtn = page.getByRole('button', { name: 'إضافة إلى المفضلة' }).first();
    await expect(wishlistBtn).toBeVisible({ timeout: 15_000 });
    await wishlistBtn.click();
    // انتظر تأكيد تبدّل الحالة فعليًا (وبالتالي كتابة localStorage) قبل الانتقال —
    // وإلا قد يحدث goto قبل اكتمال أثر النقرة (سباق).
    await expect(page.getByRole('button', { name: 'إزالة من المفضلة' }).first()).toBeVisible({ timeout: 5_000 });

    await page.goto('/wishlist');
    await expect(page.getByRole('heading', { name: 'الكتب التي أعجبتك' })).toBeVisible();
    await expect(page.getByText('لا توجد كتب محفوظة')).toHaveCount(0);

    await page.getByRole('button', { name: 'إزالة من المفضلة' }).first().click();
    await expect(page.getByText('لا توجد كتب محفوظة')).toBeVisible({ timeout: 10_000 });
  });
});
