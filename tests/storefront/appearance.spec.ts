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
  // What the dashboard has saved in the live database is its own business (it may be varied strips, other colours...): this checks
  // the store as it draws itself when nothing was changed, so the saved row is answered as the untouched one.
  await page.route('**/rest/v1/storefront_appearance*', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ pattern_strength: 100, strip_arrangement: 'uniform', home_sections: [], button_styles: {} }),
  }));
  await page.goto('/?previewLook=off');
  await expect(page.locator('.page-sections--home')).toBeVisible();
  await expect(page.locator('.shelf-section').first()).toBeVisible({ timeout: 15_000 });

  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-ab', '');
  expect(await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--store-pattern-k').trim())).toBe('1');
  await expect(page.locator('.look-preview-bar')).toHaveCount(0);

  // the series strip, then best sellers, then the category rows (and videos last): the order the home page always had.
  // (a section with nothing to show, like «وصل حديثًا» when no book is new, is not drawn, so only the ones present are compared)
  const headings = await homeHeadings(page);
  const at = (title: string) => headings.indexOf(title);
  expect(at('أقسام المتجر')).toBeGreaterThanOrEqual(0);
  expect(at('الأكثر مبيعًا')).toBeGreaterThan(at('أقسام المتجر'));
  expect(at('إصدارات متنوعة')).toBeGreaterThan(at('الأكثر مبيعًا'));
  expect(at('فيديوهات تعريفية')).toBeGreaterThan(at('إصدارات متنوعة'));

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

test('أزرار المتجر ليها لون نهاري ولون ليلي: «الأصلي» بالليل بيرجّع التصميم الليلي، واللون بيتبدّل مع تبديل الوضع', async ({ page }) => {
  const look = draft({
    button_styles: {
      view_all: { color: 'navy', tone: 1, night: { color: 'default' } },
      add_to_cart: { color: 'teal', tone: -1, night: { color: 'mint', tone: 0 } },
      quick_buy: { color: 'green', tone: 0 },
    },
  });
  await page.addInitScript(() => localStorage.setItem('daralfath-theme', 'light'));
  await page.goto(`/?previewLook=${look}`);
  await expect(page.locator('.shelf-section').first()).toBeVisible({ timeout: 15_000 });

  const root = page.locator('html');
  const paint = async (selector: string, background: string, color: string) => {
    const button = page.locator(selector).first();
    await expect(button).toHaveCSS('background-color', background);
    await expect(button).toHaveCSS('color', color);
  };

  // day: the three painted buttons, in their day colours
  await expect(root).not.toHaveClass(/dark/);
  await expect(root).toHaveAttribute('data-ab', 'view_all add_to_cart quick_buy');
  await paint('.section-heading a[data-ab-btn="view_all"]', 'rgb(4, 56, 110)', 'rgb(255, 255, 255)');
  await paint('.book-card__main[data-ab-btn="add_to_cart"]', 'rgb(72, 176, 183)', 'rgb(5, 65, 128)');
  await paint('.book-card__quick[data-ab-btn="quick_buy"]', 'rgb(6, 126, 112)', 'rgb(255, 255, 255)');

  // switch to night from the header, with the page still open: the colours follow without a reload
  await page.getByRole('button', { name: 'تفعيل الوضع الداكن' }).first().click();
  await expect(root).toHaveClass(/dark/);
  // view_all: "original" at night, so it is no longer painted; add_to_cart: mint; quick_buy: the same green as by day
  await expect(root).toHaveAttribute('data-ab', 'add_to_cart quick_buy');
  await expect(page.locator('.section-heading a[data-ab-btn="view_all"]').first()).not.toHaveCSS('background-color', 'rgb(4, 56, 110)');
  await paint('.book-card__main[data-ab-btn="add_to_cart"]', 'rgb(218, 232, 230)', 'rgb(5, 65, 128)');
  await paint('.book-card__quick[data-ab-btn="quick_buy"]', 'rgb(6, 126, 112)', 'rgb(255, 255, 255)');

  // and back to day
  await page.getByRole('button', { name: 'تفعيل الوضع المضيء' }).first().click();
  await expect(root).toHaveAttribute('data-ab', 'view_all add_to_cart quick_buy');
});

test('مسودة قديمة من غير ألوان ليلية: اللون النهاري بيفضل بالليل زي ما كان', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('daralfath-theme', 'dark'));
  await page.goto(`/?previewLook=${draft({ button_styles: { add_to_cart: { color: 'teal', tone: -1 } } })}`);
  await expect(page.locator('.shelf-section').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveAttribute('data-ab', 'add_to_cart');
  await expect(page.locator('.book-card__main[data-ab-btn="add_to_cart"]').first()).toHaveCSS('background-color', 'rgb(72, 176, 183)');
});

const linkBlock = (n: number, patch: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, kind: 'link', sort_order: n * 10, is_active: true,
  starts_at: null, ends_at: null, title: `رابط ${n}`, body: '', url: 'https://example.com', cta_label: null, image_url: null, icon: null,
  badge: null, coupon_code: null, look: { style: 'primary', display: 'button' }, ...patch,
});

async function openLinks(page: Page, settings: Record<string, unknown>, blocks: unknown[]) {
  await page.route('**/rest/v1/links_page_settings*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    is_enabled: true, title: '', tagline: 'ننشر المعرفة', show_logo: true, button_shape: 'rounded', background: 'pattern', pattern_position: 'top',
    pattern_strength: 100, footer_text: '', seo_title: '', seo_description: '', share_image_url: null, ...settings,
  }) }));
  await page.route('**/rest/v1/links_page_blocks*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(blocks) }));
  await page.goto('/links');
  await expect(page.locator('.lp-tagline')).toHaveText('ننشر المعرفة');
}

test('صفحة الروابط: الباترن من الأعلى والأسفل مع بعض، وكل واحد بنفس الدرجة', async ({ page }) => {
  await openLinks(page, { pattern_position: 'both', pattern_strength: 150 }, [linkBlock(1, {})]);
  await expect(page.locator('.lp-root')).toHaveClass(/lp-pos-both/);
  const washes = await page.locator('.lp-wash').evaluateAll((els) => els.map((el) => {
    const s = getComputedStyle(el);
    return { end: el.classList.contains('lp-wash--end'), top: s.top, bottom: s.bottom, opacity: Number(s.opacity) };
  }));
  expect(washes).toHaveLength(2);
  const top = washes.find((w) => !w.end)!;
  const bottom = washes.find((w) => w.end)!;
  expect(top.top).toBe('0px');
  expect(bottom.bottom).toBe('0px');
  expect(top.opacity).toBeCloseTo(0.12, 2); // 0.08 by day, at 150%
  expect(bottom.opacity).toBeCloseTo(0.12, 2);

  // top only: one wash, at the top
  await page.unroute('**/rest/v1/links_page_settings*');
  await openLinks(page, { pattern_position: 'top' }, [linkBlock(1, {})]);
  await expect(page.locator('.lp-wash')).toHaveCount(1);
  await expect(page.locator('.lp-wash--end')).toHaveCount(0);
});

test('أيقونات الروابط: بألوان الشركة الأصلية أو بألوان الصفحة، والاتنين موجودين', async ({ page }) => {
  const social = (n: number, icon: string, iconColor?: string) =>
    linkBlock(n, { title: icon, icon, look: { style: 'primary', display: 'icon', ...(iconColor ? { iconColor } : {}) } });
  await openLinks(page, {}, [
    social(1, 'youtube', 'brand'), social(2, 'facebook', 'brand'), social(3, 'whatsapp', 'brand'), social(4, 'tiktok', 'brand'),
    social(5, 'youtube'), // the page's colours
    social(6, 'website', 'brand'), // no company colour for a globe: brand changes nothing
  ]);
  const info = await page.locator('.lp-iconbtn').evaluateAll((els) => els.map((el) => ({
    brand: el.classList.contains('lp-iconbtn--brand'),
    face: getComputedStyle(el).backgroundColor,
    fill: el.querySelector('svg')?.getAttribute('fill') ?? '',
  })));
  expect(info).toHaveLength(6);
  expect(info[0]).toEqual({ brand: true, face: 'rgb(255, 255, 255)', fill: '#FF0000' });
  expect(info[1]).toMatchObject({ brand: true, fill: '#1877F2' });
  expect(info[2]).toMatchObject({ brand: true, fill: '#25D366' });
  expect(info[4]).toEqual({ brand: false, face: 'rgb(5, 65, 128)', fill: 'currentColor' });
  expect(info[5].brand).toBe(false); // an outline icon has no company colour: asking for it changes nothing
  expect(info[5].fill).not.toMatch(/^#/);
  await page.locator('.lp-icons').screenshot({ path: test.info().outputPath('icons-light.png') });

  // at night the brand face stays white (so the red and the black marks read), the page-colour one turns sea green
  await page.getByRole('button', { name: 'التبديل إلى المظهر الليلي' }).click();
  await expect(page.locator('.lp-root')).toHaveAttribute('data-lp-theme', 'dark');
  for (const i of [0, 1, 2, 3]) await expect(page.locator('.lp-iconbtn').nth(i)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.lp-iconbtn').nth(4)).toHaveCSS('background-color', 'rgb(6, 126, 112)');
});

test('زر رابط بأيقونة بألوان الشركة: الأيقونة على دايرة بيضاء، ودرجة اللون بتغيّر وش الزر وتظبط لون الكلام', async ({ page }) => {
  await openLinks(page, {}, [
    linkBlock(1, { title: 'يوتيوب', icon: 'youtube', look: { style: 'navy', display: 'button', iconColor: 'brand' } }),
    linkBlock(2, { title: 'فاتح', look: { style: 'navy', display: 'button', tone: -2 } }),
    linkBlock(3, { title: 'غامق', look: { style: 'teal', display: 'button', tone: 2 } }),
    linkBlock(4, { title: 'كما صُمّم', look: { style: 'navy', display: 'button' } }),
  ]);
  const chip = page.locator('.lp-btn').first().locator('.lp-btn__icon');
  await expect(chip).toHaveClass(/lp-btn__icon--brand/);
  await expect(chip).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(chip.locator('svg')).toHaveAttribute('fill', '#FF0000');

  const faces = await page.locator('.lp-btn').evaluateAll((els) => els.map((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color })));
  expect(faces[3]).toEqual({ bg: 'rgb(5, 65, 128)', fg: 'rgb(255, 255, 255)' }); // as designed
  const light = faces[1];
  const dark = faces[2];
  const channel = (c: string) => c.match(/\d+/g)!.map(Number).reduce((a, b) => a + b, 0);
  expect(channel(light.bg)).toBeGreaterThan(channel(faces[3].bg)); // navy toned lighter
  expect(channel(dark.bg)).toBeLessThan(channel('rgb(42, 163, 171)')); // teal toned darker
  // the text colour is chosen to read on the new face: light text on the dark face, dark text on the light one
  expect(dark.fg).toBe('rgb(255, 255, 255)');
  await page.locator('.lp-list').screenshot({ path: test.info().outputPath('buttons.png') });
});

// ── The customer sign-in page (/account while signed out) ────────────────────────────────────────

const washOpacity = (page: Page) => page.locator('.ax-wash').first().evaluate((el) => Number(getComputedStyle(el).opacity));
const copyPatternOpacity = (page: Page) => page.locator('.ax-copy__pattern').evaluate((el) => Number(getComputedStyle(el).opacity));

test('صفحة تسجيل العملاء: الباترن بالتصميم الأصلي، وفيها شاشة الدخول والتبويبين من غير ألوان مخصّصة', async ({ page }) => {
  await page.route('**/rest/v1/storefront_appearance*', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ pattern_strength: 100, strip_arrangement: 'uniform', home_sections: [], button_styles: {} }),
  }));
  await page.addInitScript(() => localStorage.setItem('daralfath-theme', 'light'));
  await page.goto('/account?previewLook=off');
  await expect(page.getByTestId('auth-stage')).toBeVisible();
  await expect(page.locator('form.auth-card')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-ab', '');
  expect(await washOpacity(page)).toBeCloseTo(0.1, 2);
  expect(await copyPatternOpacity(page)).toBeCloseTo(0.4, 2);
  // the page's own colours: navy button by day
  await expect(page.locator('.auth-card button[type="submit"]')).toHaveCSS('background-color', 'rgb(5, 65, 128)');
  await expect(page.locator('.auth-tabs button.active')).toHaveCSS('background-color', 'rgb(5, 65, 128)');
});

test('صفحة تسجيل العملاء: الباترن بدرجته في الوضع الليلي كمان (قاعدة قديمة بتحرّك عناصر الصفحة ومينفعش تلغي الدرجة)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('daralfath-theme', 'dark'));
  await page.goto(`/account?previewLook=${draft({ pattern_strength: 100 })}`);
  await expect(page.getByTestId('auth-stage')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect.poll(() => washOpacity(page)).toBeCloseTo(0.12, 2);
  await expect.poll(() => copyPatternOpacity(page)).toBeCloseTo(0.4, 2);
  const box = await page.locator('.ax-wash').evaluate((el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width), vw: window.innerWidth }; });
  expect(box).toEqual({ left: 0, width: box.vw, vw: box.vw }); // edge to edge, from the left edge of the screen
});

test('صفحة تسجيل العملاء: درجة الباترن اللي من لوحة التحكم بتتطبق عليها (متجر كله)، ومن صفر يختفي', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('daralfath-theme', 'light'));
  await page.goto(`/account?previewLook=${draft({ pattern_strength: 200 })}`);
  await expect(page.getByTestId('auth-stage')).toBeVisible();
  expect(await washOpacity(page)).toBeCloseTo(0.2, 2); // 0.1 at twice the strength
  expect(await copyPatternOpacity(page)).toBeCloseTo(0.8, 2); // 0.4 at twice the strength

  await page.goto(`/account?previewLook=${draft({ pattern_strength: 0 })}`);
  await expect(page.getByTestId('auth-stage')).toBeVisible();
  expect(await washOpacity(page)).toBe(0);
  expect(await copyPatternOpacity(page)).toBe(0);
});

test('صفحة تسجيل العملاء: زر الدخول والتبويب بألوان من لوحة التحكم، لكل وضع (فاتح وليلي) لوحده', async ({ page }) => {
  const look = draft({
    button_styles: {
      auth_submit: { color: 'teal', tone: 0, night: { color: 'mint', tone: 0 } },
      auth_tabs: { color: 'green', tone: 0 },
    },
  });
  await page.addInitScript(() => localStorage.setItem('daralfath-theme', 'light'));
  await page.goto(`/account?previewLook=${look}`);
  const submit = page.locator('.auth-card button[type="submit"]');
  const tab = page.locator('.auth-tabs button.active');

  await expect(page.locator('html')).toHaveAttribute('data-ab', 'auth_submit auth_tabs');
  await expect(submit).toHaveCSS('background-color', 'rgb(42, 163, 171)');
  await expect(tab).toHaveCSS('background-color', 'rgb(6, 126, 112)');
  // the text colour is chosen to read on the colour
  await expect(submit).toHaveCSS('color', 'rgb(5, 65, 128)');
  await expect(tab).toHaveCSS('color', 'rgb(255, 255, 255)');

  // switching to night: the submit follows its own night colour, the tab keeps its day one (no night colour was set)
  await page.getByRole('button', { name: 'تفعيل الوضع الداكن' }).first().click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(submit).toHaveCSS('background-color', 'rgb(218, 232, 230)');
  await expect(tab).toHaveCSS('background-color', 'rgb(6, 126, 112)');

  // the other tab becomes the chosen one: it takes the colour too
  await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).first().click();
  await expect(page.locator('.auth-tabs button.active')).toHaveText('إنشاء حساب');
  await expect(page.locator('.auth-tabs button.active')).toHaveCSS('background-color', 'rgb(6, 126, 112)');
});

test('صفحة تسجيل العملاء: بتشتغل في الوضعين ومن غير سكرول أفقي على الموبايل، والفورم كله ظاهر', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((t) => localStorage.setItem('daralfath-theme', t), theme);
    for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await page.goto('/account');
      await expect(page.getByTestId('auth-stage')).toBeVisible();
      for (const placeholder of ['name@example.com', '••••••••']) await expect(page.getByPlaceholder(placeholder)).toBeVisible();
      await expect(page.locator('.auth-card button[type="submit"]')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${theme} ${size.width}`).toBe(true);
    }
  }
});

test('صفحة تسجيل العملاء: الباترن مغطّي الخلفية كلها بدرجة واحدة، ومفيش شريط باترن صغير فوق الفوتر', async ({ page }) => {
  await page.goto('/account');
  await expect(page.getByTestId('auth-stage')).toBeVisible();
  const wash = await page.locator('.ax-wash').evaluate((el) => {
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return { mask: s.maskImage || s.webkitMaskImage || 'none', width: Math.round(box.width), viewport: window.innerWidth };
  });
  expect(wash.mask).toBe('none'); // no fade shape of any kind: the pattern is even
  expect(wash.width).toBe(wash.viewport); // edge to edge of the screen
  await expect(page.locator('.ax-wash')).toHaveCount(1);
  // the footer's small pattern strip is not drawn on this page (it still is elsewhere in the store)
  expect(await page.locator('.site-footer').evaluate((el) => getComputedStyle(el, '::before').display)).toBe('none');
  await page.goto('/books');
  expect(await page.locator('.site-footer').evaluate((el) => getComputedStyle(el, '::before').display)).not.toBe('none');
});

test('صفحة تسجيل العملاء: الأنماط الأخرى (إنشاء حساب، نسيت كلمة المرور) بنفس التصميم', async ({ page }) => {
  await page.goto('/account');
  await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).first().click();
  await expect(page.getByPlaceholder('مثال: أحمد محمد')).toBeVisible();
  await expect(page.locator('.auth-card button[type="submit"]')).toContainText('إنشاء الحساب');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).first().click();
  await page.getByRole('button', { name: 'نسيت كلمة المرور؟' }).click();
  await expect(page.locator('.auth-mode-title')).toContainText('نسيت كلمة المرور');
  await expect(page.getByTestId('auth-stage')).toBeVisible();
});
