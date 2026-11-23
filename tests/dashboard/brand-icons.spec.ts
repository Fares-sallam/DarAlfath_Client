import { createHash } from 'node:crypto';
import { test, expect } from '../fixtures';

// The dashboard's tab icon and the picture a shared link shows are the new identity (the same mark as the store's tab), not the old logo.
// Nothing needs a sign-in: the page head is the same for every page.

test.use({ storageState: { cookies: [], origins: [] } });

/** The first bytes of a file: an icon file must be what it says (the dashboard once had a 1142-pixel JPEG named favicon.ico). */
const ICO = [0x00, 0x00, 0x01, 0x00];
/** The hash of the OLD favicon1.ico (an unrelated black-and-white circle left from a template). */
const OLD_FAVICON1 = '47980e02e9a643f38b512b11463bc118d776bcd4100f3b7453035dd93bf1996c';
const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];

test('أيقونة تبويب اللوحة: العلامة الجديدة بمقاسات حقيقية، وfavicon.ico أيقونة فعلًا مش صورة كبيرة متسمّية ico', async ({ page }) => {
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto('/login');
  const icons = await page.locator('head link[rel~="icon"], head link[rel="shortcut icon"], head link[rel="apple-touch-icon"]').evaluateAll((els) =>
    els.map((el) => ({ href: el.getAttribute('href')!, sizes: el.getAttribute('sizes') })));
  expect(icons.length).toBeGreaterThanOrEqual(5);

  for (const icon of icons) {
    const res = await page.request.get(icon.href);
    expect(res.status(), icon.href).toBe(200);
    const body = await res.body();
    if (icon.href.endsWith('.png')) {
      expect([...body.subarray(0, 4)], icon.href).toEqual(PNG);
      const [w, h] = (icon.sizes ?? '').split('x').map(Number);
      if (w) expect({ w: body.readUInt32BE(16), h: body.readUInt32BE(20) }, icon.href).toEqual({ w, h });
    }
    if (icon.href.endsWith('.ico')) {
      expect([...body.subarray(0, 4)], icon.href).toEqual(ICO);
      expect([...body.subarray(0, 3)]).not.toEqual(JPEG);
      expect(body.length, icon.href).toBeLessThan(20_000);
    }
  }
  // the browser asks for /favicon.ico by itself too
  const ico = await page.request.get('/favicon.ico');
  expect([...(await ico.body()).subarray(0, 4)]).toEqual(ICO);
});

test('لينك اللوحة على واتساب: صورة المشاركة هي لوجو الدار الجديد (صورة حقيقية مربعة وخفيفة)', async ({ page }) => {
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto('/login');
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(og).toMatch(/^https:\/\/dar-alfath-dashboard\.vercel\.app\/branding\/dar-alfath-logo-2026\.jpg$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary');
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', /دار الفتح/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#054180');

  // the same file served from this run (the address in the tag is the production one)
  const res = await page.request.get('/branding/dar-alfath-logo-2026.jpg');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/image\/jpeg/);
  const body = await res.body();
  expect([...body.subarray(0, 3)]).toEqual(JPEG);
  expect(body.length).toBeLessThan(300_000);      // WhatsApp's own advice for a preview picture
  expect(body.length).toBeGreaterThan(5_000);
});

test('عناوين الأيقونات القديمة في اللوحة بتقدّم الأيقونة الجديدة (favicon1.ico كانت أيقونة تانية من قالب قديم)', async ({ page }) => {
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto('/login');
  for (const url of ['/favicon.ico', '/favicon1.ico']) {
    const body = await (await page.request.get(url)).body();
    expect([...body.subarray(0, 4)], url).toEqual(ICO);
    expect(body.length, url).toBeLessThan(20_000);
    expect(createHash('sha256').update(body).digest('hex'), url).not.toBe(OLD_FAVICON1);
  }
});
