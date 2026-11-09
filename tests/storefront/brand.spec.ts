import { test, expect, type Page } from '../fixtures';

// The house identity: its two fonts, the lockup (navy lettering by day, mint by night, mint on the
// footer always), the brand swatches on the filled button, and the pattern frieze over the footer.
// Read-only: nothing is written.

async function open(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => localStorage.setItem('daralfath-theme', t), theme);
  await page.goto('/');
  await expect(page.locator('.site-header .brand-lockup')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

const shown = (page: Page, scope: string) =>
  page.locator(`${scope} .brand-lockup__img`).evaluateAll((imgs) =>
    imgs.filter((i) => getComputedStyle(i).display !== 'none').map((i) => new URL((i as HTMLImageElement).src).pathname));

test('الخطوط: بهيج للنص و DIN Next للعناوين، من ملفات الموقع نفسه (مش Google Fonts)', async ({ page }) => {
  const google: string[] = [];
  page.on('request', (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) google.push(r.url()); });
  await open(page, 'light');
  await expect(page.locator('h2').first()).toBeVisible({ timeout: 20_000 });

  const fonts = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    heading: getComputedStyle(document.querySelector('h2')!).fontFamily,
    bahij: document.fonts.check('16px "Bahij TheSansArabic"', 'دار الفتح'),
    din: document.fonts.check('700 16px "DIN Next LT Arabic"', 'دار الفتح'),
  }));
  expect(fonts.body).toMatch(/^"Bahij TheSansArabic"/);
  expect(fonts.heading).toMatch(/^"DIN Next LT Arabic"/);
  expect(fonts.bahij && fonts.din).toBe(true);
  expect(google).toEqual([]);
});

test('اللوجو: الحروف كحلي في الفاتح ونعناعي في الداكن، والفوتر دايمًا النسخة الفاتحة الحروف', async ({ page }) => {
  await open(page, 'light');
  expect(await shown(page, '.site-header')).toEqual(['/branding/logo-horizontal.svg']);
  expect(await shown(page, '.site-footer')).toEqual(['/branding/logo-horizontal-dark.svg']);
  await expect(page.locator('.site-header .brand-lockup img:visible')).toHaveAttribute('alt', 'دار الفتح للنشر والتوزيع');

  await page.evaluate(() => document.documentElement.classList.add('dark'));
  expect(await shown(page, '.site-header')).toEqual(['/branding/logo-horizontal-dark.svg']);
  expect(await shown(page, '.site-footer')).toEqual(['/branding/logo-horizontal-dark.svg']);
});

test('ألوان الهوية: الزرار الأساسي كحلي في الفاتح وأخضر بحري في الداكن، والنقشة فوق الفوتر', async ({ page }) => {
  await open(page, 'light');
  const button = page.locator('.book-card .primary-button').first();
  await expect(button).toBeVisible({ timeout: 20_000 });
  expect(await button.evaluate((b) => getComputedStyle(b).backgroundImage)).toContain('rgb(5, 65, 128)');

  const frieze = await page.locator('.site-footer').evaluate((f) => {
    const s = getComputedStyle(f, '::before');
    return { image: s.backgroundImage, height: parseFloat(s.height) };
  });
  expect(frieze.image).toContain('/patterns/brand-pattern.svg');
  expect(frieze.height).toBeGreaterThan(15);

  await page.evaluate(() => document.documentElement.classList.add('dark'));
  expect(await button.evaluate((b) => getComputedStyle(b).backgroundImage)).toContain('rgb(6, 126, 112)');
  expect(await page.locator('.site-footer').evaluate((f) => getComputedStyle(f, '::before').backgroundImage))
    .toContain('/patterns/brand-pattern-night.svg');
});

test('أيقونة الموقع ولونه: علامة الدار الجديدة، ومفيش أثر للوجو القديم', async ({ page }) => {
  await open(page, 'light');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/branding/logo-mark.svg');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#054180');
  expect(await page.locator('img[src*="dar-alfath-logo.jpeg"]').count()).toBe(0);
  for (const path of ['/branding/logo-mark.svg', '/branding/apple-touch-icon.png', '/patterns/brand-pattern.svg', '/fonts/bahij-400.woff2']) {
    expect((await page.request.get(path)).status(), path).toBe(200);
  }
});
