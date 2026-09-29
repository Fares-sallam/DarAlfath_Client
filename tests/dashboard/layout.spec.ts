import { test, expect } from '@playwright/test';

// Wide tables must scroll inside their own box: at a common laptop width no
// dashboard page may be wider than the screen (it used to push the header
// buttons, e.g. «تنزيل تقرير», off-screen).
const PAGES = ['/', '/books', '/orders', '/inventory', '/analytics', '/shipping', '/customers', '/coupons', '/series', '/activity', '/settings'];

for (const path of PAGES) {
  test(`لا يوجد سكرول أفقي في ${path} على شاشة 1280`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(path);
    // Books/inventory keep loading images, so "networkidle" may never come:
    // wait for the page's own heading, then give its data a moment to render.
    await page.locator('main h1').first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(2_000);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
}
