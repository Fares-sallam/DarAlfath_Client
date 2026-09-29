import { test, expect } from '@playwright/test';

test.describe('صفحة المجموعة', () => {
  test('تعرض كتب النسخة المختارة وتسمح بالشراء، وتتبدل الكتب مع النسخة', async ({ page }) => {
    await page.goto('/books');
    const bundleCard = page
      .getByRole('button', { name: /^فتح صفحة/ })
      .filter({ has: page.locator('.book-card__badges', { hasText: 'مجموعة' }) })
      .first();
    await expect(bundleCard).toBeVisible({ timeout: 15_000 });
    await bundleCard.click();
    await page.waitForURL(/\/book\//);

    const books = page.locator('.bk3-bundle__item');
    await expect(books.first()).toBeVisible({ timeout: 15_000 });
    expect(await books.count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.bk3-bundle .bk3-variants__hd')).toContainText('محتويات');

    const copies = page.locator('.bk3-var');
    if ((await copies.count()) > 1) {
      // Several copies: picking another one shows that copy's books.
      const other = copies.nth(1);
      const name = (await other.locator('.bk3-var__name').innerText()).trim();
      await other.click();
      await expect(page.locator('.bk3-bundle .bk3-variants__hd')).toContainText(name);
    } else {
      // One copy: it's pre-selected, so there's no picker.
      await expect(page.locator('.bk3-variants')).toHaveCount(0);
    }

    // Always a copy selected — never "اختر نسخة أولًا".
    await expect(page.locator('.bk3-cart-btn')).not.toHaveText(/اختر نسخة/);
  });

  test('لا يوجد سكرول أفقي في صفحة المجموعة على سطح المكتب', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/books');
    await page
      .getByRole('button', { name: /^فتح صفحة/ })
      .filter({ has: page.locator('.book-card__badges', { hasText: 'مجموعة' }) })
      .first()
      .click();
    await page.locator('.bk3-bundle__item').first().waitFor({ timeout: 15_000 });
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
