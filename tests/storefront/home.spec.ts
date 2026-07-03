import { test, expect } from '@playwright/test';

test.describe('الصفحة الرئيسية', () => {
  test('الكتالوج يظهر للزائر بدون تسجيل دخول', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'اختَر كتابك كأنك تتجول بين رفوف دار الفتح' })).toBeVisible();
    await expect(page.getByText('أحدث الكتب في الكتالوج')).toBeVisible();

    // على الأقل كتاب واحد قابل للفتح من الكتالوج.
    const firstBook = page.getByRole('button', { name: /^فتح صفحة/ }).first();
    await expect(firstBook).toBeVisible({ timeout: 15_000 });
  });

  test('لا يوجد سكرول أفقي على سطح المكتب (اختبار ارتداد)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    // الصفحة فيها نشاط شبكة مستمر (React Query) قد لا يصل لـ"idle" أبدًا؛
    // ننتظر عنصرًا فعليًا بدل ذلك (أكثر موثوقية من waitForLoadState).
    await expect(page.getByText('أحدث الكتب في الكتالوج')).toBeVisible({ timeout: 15_000 });

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('قائمة الموبايل تُفتح وتُغلق بدون إحداث سكرول أفقي (اختبار ارتداد)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    const noScrollBefore = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(noScrollBefore).toBe(true);

    await page.getByLabel('فتح القائمة').click();
    await expect(page.getByLabel('إغلاق القائمة')).toBeVisible();

    const noScrollWhileOpen = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(noScrollWhileOpen).toBe(true);

    await page.getByLabel('إغلاق القائمة').click();
    // القائمة تُخفى بـ transform (translateX) خارج الشاشة، وليس بـ display/visibility،
    // فنتحقق من زوال كلاس --open بدلاً من toBeHidden.
    await expect(page.locator('.mobile-nav-drawer--open')).toHaveCount(0);
  });
});
