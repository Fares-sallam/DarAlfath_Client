import { test, expect, type Page } from '../fixtures';

// What the dashboard («مظهر المتجر») decides, as the store draws it. The store reads one row of
// storefront_appearance; here the dashboard's own preview door is used instead (?previewLook=<draft>), which draws
// the same thing without touching the database, and the links page's settings are answered from memory.

const draft = (value: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(value)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const homeHeadings = (page: Page) => page.locator('.page-sections--home h2').allTextContents().then((all) => all.map((t) => t.trim()));
const strips = (page: Page) =>
  page.locator('.page-sections--home .ornament-divider__mark').evaluateAll((els) =>
    els.map((svg) => Array.from(svg.querySelectorAll('path')).map((p) => (p.getAttribute('class') ?? '').replace('ornament-tone-', '')[0]).join('')));

test('من غير مسودة: المتجر بتصميمه الأصلي، الأقسام بترتيبها القديم والشرائط متطابقة والأزرار زي ما صُمّمت', async ({ page }) => {
  await page.goto('/?previewLook=off');
  await expect(page.locator('.page-sections--home')).toBeVisible();
  await expect(page.locator('.shelf-section').first()).toBeVisible({ timeout: 15_000 });

  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-ab', '');
  expect(await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--store-pattern-k').trim())).toBe('1');
  await expect(page.locator('.look-preview-bar')).toHaveCount(0);

  // the series strip, then best sellers, then what is new: the order the home page always had
  const headings = await homeHeadings(page);
  expect(headings.indexOf('الأكثر مبيعًا')).toBeLessThan(headings.indexOf('وصل حديثًا'));

  const all = await strips(page);
  expect(all.length).toBeGreaterThan(0);
  for (const strip of all) expect(strip).toBe('btbbbtbbbtbb'); // three identical units
});

test('مسودة المعاينة: الترتيب والإخفاء وألوان الأزرار الأربعة والشرائط المتنوعة ودرجة الباترن', async ({ page }) => {
  const look = draft({
    pattern_strength: 180,
    strip_arrangement: 'varied',
    home_sections: [
      { key: 'new-arrivals', visible: true },
      { key: 'best-sellers', visible: true },
      { key: 'departments', visible: true },
      { key: 'categories', visible: true },
      { key: 'intro-videos', visible: false },
      { key: 'features', visible: false },
    ],
    button_styles: {
      view_all: { color: 'navy', tone: 1 },
      view_category: { color: 'mint', tone: 0 },
      add_to_cart: { color: 'teal', tone: -1 },
      quick_buy: { color: 'green', tone: 0 },
    },
  });
  await page.goto(`/?previewLook=${look}`);
  await expect(page.locator('.shelf-section').first()).toBeVisible({ timeout: 15_000 });

  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-ab', 'view_all view_category add_to_cart quick_buy');
  expect(await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--store-pattern-k').trim())).toBe('1.8');
  await expect(page.locator('.look-preview-bar')).toContainText('قبل الحفظ');

  // order: new arrivals before best sellers now; the hidden sections are gone
  const headings = await homeHeadings(page);
  expect(headings.indexOf('وصل حديثًا')).toBeLessThan(headings.indexOf('الأكثر مبيعًا'));
  await expect(page.getByRole('heading', { name: 'فيديوهات تعريفية' })).toHaveCount(0);
  await expect(page.getByTestId('feature-boxes')).toHaveCount(0);

  // the four buttons, in the house colours (a button may still be fading in, so the colour is waited for)
  const paint = async (selector: string, background: string, color: string) => {
    const button = page.locator(selector).first();
    await expect(button).toHaveCSS('background-color', background);
    await expect(button).toHaveCSS('color', color);
  };
  await paint('.section-heading a[data-ab-btn="view_all"]', 'rgb(4, 56, 110)', 'rgb(255, 255, 255)');
  await paint('.section-heading a[data-ab-btn="view_category"]', 'rgb(218, 232, 230)', 'rgb(5, 65, 128)');
  await paint('.book-card__main[data-ab-btn="add_to_cart"]', 'rgb(72, 176, 183)', 'rgb(5, 65, 128)');
  await paint('.book-card__quick[data-ab-btn="quick_buy"]', 'rgb(6, 126, 112)', 'rgb(255, 255, 255)');

  // the strips: each unit has one teal and one green crescent, and a unit is never the one before it
  const all = await strips(page);
  expect(all.length).toBeGreaterThan(0);
  for (const strip of all) {
    const units = [strip.slice(0, 4), strip.slice(4, 8), strip.slice(8, 12)];
    for (const [i, unit] of units.entries()) {
      expect([...unit].filter((c) => c === 't')).toHaveLength(1);
      expect([...unit].filter((c) => c === 'g')).toHaveLength(1);
      if (i > 0) expect(unit).not.toBe(units[i - 1]);
    }
  }
  // the same strips again after a reload: the arrangement is fixed, not drawn afresh each time
  await page.reload();
  await expect(page.locator('.shelf-section').first()).toBeVisible({ timeout: 15_000 });
  expect(await strips(page)).toEqual(all);
});

test('المسودة بتفضل مع التنقل في نفس التاب، و«إغلاق المعاينة» بيرجّع التصميم الأصلي', async ({ page }) => {
  await page.goto(`/?previewLook=${draft({ button_styles: { add_to_cart: { color: 'navy', tone: 0 } } })}`);
  await expect(page.locator('html')).toHaveAttribute('data-ab', 'add_to_cart');

  await page.goto('/books'); // no draft in this address: the one kept for the tab is used
  await expect(page.locator('html')).toHaveAttribute('data-ab', 'add_to_cart');
  await expect(page.locator('.look-preview-bar')).toBeVisible();

  await page.getByRole('button', { name: 'إغلاق المعاينة' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-ab', '');
  await expect(page.locator('.look-preview-bar')).toHaveCount(0);
});

test('مسودة بقيم غلط: الصفحة بترجع لتصميمها بدل ما تتكسر (لون مش من الهوية، قسم مش موجود، درجة خارج المدى)', async ({ page }) => {
  await page.goto(`/?previewLook=${draft({
    pattern_strength: 'قوي جدًا',
    strip_arrangement: 'wild',
    home_sections: [{ key: 'nonsense', visible: true }, { key: 'offers', visible: 7 }],
    button_styles: { add_to_cart: { color: '#ff0000', tone: 40 }, quick_buy: { color: 'red', tone: 1 } },
  })}`);
  await expect(page.locator('.shelf-section').first()).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('html')).toHaveAttribute('data-ab', '');
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--store-pattern-k').trim())).toBe('1');
  expect((await homeHeadings(page)).length).toBeGreaterThan(2);
  for (const strip of await strips(page)) expect(strip).toBe('btbbbtbbbtbb');
});

test('صفحة الروابط: الباترن من الأسفل بدرجته، ومن الأعلى كما كان، والفاصل المتنوع', async ({ page }) => {
  const settings = {
    is_enabled: true, title: '', tagline: 'ننشر المعرفة', show_logo: true, button_shape: 'rounded', background: 'pattern',
    pattern_position: 'bottom', pattern_strength: 50, footer_text: '', seo_title: '', seo_description: '', share_image_url: null,
  };
  const blocks = [
    { id: '00000000-0000-4000-8000-000000000001', kind: 'link', sort_order: 10, is_active: true, starts_at: null, ends_at: null, title: 'المتجر', body: '', url: '/', cta_label: null, image_url: null, icon: 'store', badge: null, coupon_code: null, look: { style: 'primary', display: 'button' } },
    { id: '00000000-0000-4000-8000-000000000002', kind: 'divider', sort_order: 20, is_active: true, starts_at: null, ends_at: null, title: '', body: '', url: null, cta_label: null, image_url: null, icon: null, badge: null, coupon_code: null, look: { type: 'pattern', length: 'medium', arrangement: 'varied' } },
    { id: '00000000-0000-4000-8000-000000000003', kind: 'divider', sort_order: 30, is_active: true, starts_at: null, ends_at: null, title: '', body: '', url: null, cta_label: null, image_url: null, icon: null, badge: null, coupon_code: null, look: { type: 'pattern', length: 'medium' } },
  ];
  await page.route('**/rest/v1/links_page_settings*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) }));
  await page.route('**/rest/v1/links_page_blocks*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(blocks) }));

  await page.goto('/links');
  await expect(page.locator('.lp-tagline')).toHaveText('ننشر المعرفة');
  const root = page.locator('.lp-root');
  await expect(root).toHaveClass(/lp-pos-bottom/);
  expect(await root.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--lp-pattern-k'))).toBe('0.5');
  const wash = await page.locator('.lp-wash').evaluate((el) => {
    const s = getComputedStyle(el);
    return { top: s.top, bottom: s.bottom, opacity: Number(s.opacity) };
  });
  expect(wash.bottom).toBe('0px');
  expect(wash.opacity).toBeCloseTo(0.04, 2); // the day wash 0.08 at half strength (night is 0.14)

  const marks = await page.locator('.lp-divider--pattern .lp-mark').evaluateAll((els) =>
    els.map((svg) => ({ arrangement: svg.getAttribute('data-arrangement'), tones: Array.from(svg.querySelectorAll('path')).map((p) => p.getAttribute('class')!.replace('lp-tone-', '')[0]).join('') })));
  expect(marks).toHaveLength(2);
  expect(marks[0].arrangement).toBe('varied');
  expect(marks[0].tones).not.toBe('btbbbtbbbtbb');
  expect(marks[1]).toEqual({ arrangement: 'uniform', tones: 'btbbbtbbbtbb' });
});

test('صفحة الروابط: قاعدة بيانات من غير أعمدة الباترن الجديدة لسه بتفتح بالتصميم القديم', async ({ page }) => {
  let asked = 0;
  await page.route('**/rest/v1/links_page_settings*', (route) => {
    asked += 1;
    // the first ask names the new columns: the database does not have them yet (42703); the second does not
    if (route.request().url().includes('pattern_position')) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42703', message: 'column links_page_settings.pattern_position does not exist' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_enabled: true, title: '', tagline: 'ننشر المعرفة', show_logo: true, button_shape: 'rounded', background: 'pattern', footer_text: '', seo_title: '', seo_description: '', share_image_url: null }) });
  });
  await page.route('**/rest/v1/links_page_blocks*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('/links');
  // the real page (not its loading skeleton) is there once the line under the logo is
  await expect(page.locator('.lp-tagline')).toHaveText('ننشر المعرفة');
  await expect(page.locator('.lp-root')).not.toHaveClass(/lp-pos-bottom/);
  await expect(page.locator('.lp-root')).toHaveClass(/lp-bg-pattern/);
  expect(asked).toBeGreaterThanOrEqual(2);
});
