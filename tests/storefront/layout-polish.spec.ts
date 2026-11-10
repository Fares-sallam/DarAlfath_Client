import { test, expect, type Page, type Route } from '../fixtures';

// The header's section row (centred, a fading rule between items, الفتح الرباني first), "كل التصنيفات" in the
// strip below, the pattern divider (three units, tight spacing, between the home shelves), the white house
// cover for a book with no picture, the bigger footer lockup, the footer paragraph's alignment and the
// pattern wall on the dark theme. Read-only: the few rows that are changed are answered in flight.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

const open = async (page: Page, theme: 'light' | 'dark' = 'light', path = '/') => {
  await page.addInitScript((t) => localStorage.setItem('daralfath-theme', t), theme);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path);
  await expect(page.locator('.site-header__nav')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
};

test('الشريط العلوي: في النص، وبين كل اثنين فاصل بيتخفي طرفاه، وسلسلة الفتح الرباني أول حاجة بعد «الكتب»', async ({ page }) => {
  await open(page);
  const items = page.locator('.site-header__nav > *');
  await expect.poll(() => items.count(), { timeout: 20_000 }).toBeGreaterThan(4);

  // Centred: the row's items sit around the middle of the page, not against the right edge.
  const box = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.site-header__nav > *')].map((e) => e.getBoundingClientRect());
    const left = Math.min(...els.map((r) => r.left));
    const right = Math.max(...els.map((r) => r.right));
    return { left, right, page: document.documentElement.clientWidth };
  });
  expect(Math.abs((box.left + box.right) / 2 - box.page / 2)).toBeLessThan(8);
  expect(box.left).toBeGreaterThan(40);

  // A rule between neighbours that fades at both ends; none before the first item.
  const rule = (i: number) => items.nth(i).evaluate((el) => {
    const s = getComputedStyle(el, '::before');
    return { content: s.content, width: s.width, image: s.backgroundImage };
  });
  expect((await rule(0)).content).toBe('none');
  const second = await rule(1);
  expect(second.width).toBe('1px');
  expect(second.image).toContain('linear-gradient');
  expect(second.image).toContain('rgba(0, 0, 0, 0)');

  // Bigger than the 12.5px it was, and the order: الرئيسية، الكتب، then الفتح الرباني.
  expect(await items.nth(0).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15);
  const labels = await page.locator('.site-header__nav > a, .site-header__nav > .nav-dropdown > .nav-dropdown__trigger')
    .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
  expect(labels.slice(0, 2)).toEqual(['الرئيسية', 'الكتب']);
  expect(labels).not.toContain('كل التصنيفات');
});

test('ترتيب الأقسام في الشريط العلوي: بترتيب السلاسل من لوحة التحكم، وأول واحدة بعد «الكتب»', async ({ page }) => {
  // Whatever the dashboard saved as the order (sort_order) is the order the server returns; the row follows it.
  await page.route('**/rest/v1/book_series*', async (route) => {
    try {
      const response = await route.fetch();
      const rows = (await response.json()) as { name: string }[];
      const flagship = 'سلسلة الفتح الرباني';
      await route.fulfill({ response, json: [...rows.filter((r) => r.name === flagship), ...rows.filter((r) => r.name !== flagship)] });
    } catch {
      await route.continue().catch(() => undefined);
    }
  });
  await open(page);
  const triggers = page.locator('.site-header__nav > .nav-dropdown > .nav-dropdown__trigger');
  await expect.poll(() => triggers.count(), { timeout: 20_000 }).toBeGreaterThan(2);
  await expect(triggers.first()).toHaveText('سلسلة الفتح الرباني');
  const labels = await page.locator('.site-header__nav > a, .site-header__nav > .nav-dropdown > .nav-dropdown__trigger')
    .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
  expect(labels.slice(0, 3)).toEqual(['الرئيسية', 'الكتب', 'سلسلة الفتح الرباني']);
});

test('«كل التصنيفات»: في الشريط اللي تحت بعد «كل الكتب» ومش في الشريط العلوي', async ({ page }) => {
  await open(page);
  const pills = page.locator('nav.category-bar .category-bar__pill');
  await expect.poll(() => pills.count(), { timeout: 20_000 }).toBeGreaterThan(2);
  await expect(pills.nth(0)).toHaveText('كل الكتب');
  await expect(pills.nth(1)).toHaveText('كل التصنيفات');
  await expect(pills.nth(1)).toHaveAttribute('href', '/categories');
  await expect(page.locator('.site-header__nav a[href="/categories"]')).toHaveCount(0);

  await pills.nth(1).click();
  await expect(page).toHaveURL(/\/categories$/);
  await expect(page.locator('nav.category-bar .category-bar__pill.active')).toHaveText('كل التصنيفات');
});

test('الفاصل: ٣ وحدات من النقشة جنب بعض، ومسافاته قليلة، وبين كل قسمين في الرئيسية', async ({ page }) => {
  await open(page);
  await expect.poll(() => page.locator('.page-sections--home > .ornament-divider').count(), { timeout: 20_000 }).toBeGreaterThan(1);

  const dividers = page.locator('.page-sections--home > .ornament-divider');
  expect(await dividers.first().locator('.ornament-divider__mark > g').count()).toBe(3);
  expect(await dividers.first().locator('.ornament-divider__mark path').count()).toBe(12);

  // The home page's children after the banner and departments alternate: shelf, divider, shelf, ... and never
  // start or end on a divider, or stack two.
  const kinds = await page.evaluate(() =>
    [...document.querySelector('.page-sections--home')!.children]
      .filter((el) => el.matches('section.reveal') || el.matches('.ornament-divider'))
      .map((el) => (el.matches('.ornament-divider') ? 'divider' : 'section')));
  expect(kinds[0]).toBe('section');
  expect(kinds[kinds.length - 1]).toBe('section');
  kinds.forEach((kind, i) => { if (kind === 'divider') { expect(kinds[i - 1]).toBe('section'); expect(kinds[i + 1]).toBe('section'); } });

  // Tight: well under the 100px or so of empty space there used to be above and below.
  // (offset positions, so a section still sliding in with its reveal doesn't skew the measure)
  const gaps = await page.evaluate(() => {
    const d = document.querySelector('.page-sections--home > .ornament-divider') as HTMLElement;
    const before = d.previousElementSibling as HTMLElement;
    const after = d.nextElementSibling as HTMLElement;
    return { above: d.offsetTop - (before.offsetTop + before.offsetHeight), below: after.offsetTop - (d.offsetTop + d.offsetHeight) };
  });
  expect(gaps.above).toBeLessThan(40);
  expect(gaps.below).toBeLessThan(40);
});

test('كتاب من غير صورة: غلاف أبيض فيه اللوجو بالاسم وباترن فوق وتحت (في الفاتح والداكن)', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.route('**/rest/v1/products_public_catalog*', async (route) => {
      try {
        const response = await route.fetch();
        const rows = (await response.json()) as Record<string, unknown>[];
        await route.fulfill({ response, json: rows.map((row) => ({ ...row, cover_url: null })) });
      } catch {
        await route.continue().catch(() => undefined);
      }
    });
    await open(page, theme, '/books');
    const cover = page.locator('.book-card .book-cover__blank').first();
    await expect(cover).toBeVisible({ timeout: 20_000 });

    expect(await cover.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    await expect(cover.locator('img.book-cover__logo')).toHaveAttribute('src', '/branding/logo-full.svg');
    const bands = await cover.locator('.book-cover__band').evaluateAll((els) =>
      els.map((el) => ({ image: getComputedStyle(el).backgroundImage, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom })));
    expect(bands).toHaveLength(2);
    bands.forEach((band) => expect(band.image).toContain('/patterns/brand-pattern.svg'));
    const frame = await cover.boundingBox();
    expect(Math.abs(bands[0].top - frame!.y)).toBeLessThan(2);
    expect(Math.abs(bands[1].bottom - (frame!.y + frame!.height))).toBeLessThan(2);
    // The logo sits between the two bands.
    const logo = await cover.locator('img.book-cover__logo').boundingBox();
    expect(logo!.y).toBeGreaterThan(bands[0].bottom - 1);
    expect(logo!.y + logo!.height).toBeLessThan(bands[1].top + 1);
  }
});

test('الفوتر: اللوجو أكبر، وتنسيق الفقرة من لوحة التحكم (يمين / توسيط / ضبط الأطراف)', async ({ page }) => {
  const settings = (align: string | null) => page.route('**/rest/v1/store_settings*', (route) => {
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const row = { store_name: 'دار الفتح للنشر والتوزيع', store_description: '', store_email: '', store_phone: '', store_address: '', updated_at: '2026-11-10T00:00:00Z',
      footer_tagline: 'شركتنا دار الفتح للنشر والتوزيع رائدة في مجال النشر التعليمي والتربوي للأطفال. نسعى بفضل الله أن نصنع من الأطفال جيلًا قادرًا على التميز والتقدم.', footer_tagline_align: align };
    return json(route, single ? row : [row]);
  });
  const read = () => page.locator('.site-footer__brand p').evaluate((p) => {
    const s = getComputedStyle(p);
    return { align: s.textAlign, last: s.textAlignLast };
  });

  await settings('justify');
  await open(page);
  await expect(page.locator('.site-footer__brand--justify p')).toBeVisible();
  expect((await read()).align).toBe('justify');
  expect(await page.locator('.site-footer .brand-lockup__img:visible').evaluate((img) => img.getBoundingClientRect().height)).toBeGreaterThanOrEqual(64);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await settings('center');
  await page.reload();
  await expect(page.locator('.site-footer__brand--center p')).toBeVisible({ timeout: 20_000 });
  expect(await read()).toEqual({ align: 'center', last: 'center' });

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await settings(null); // nothing chosen yet: as it always was
  await page.reload();
  await expect(page.locator('.site-footer__brand--start p')).toBeVisible({ timeout: 20_000 });
  expect((await read()).align).toMatch(/^(start|right)$/);
});

test('الدارك مود: النقشة في الخلفية ظاهرة (مفيش لون مغطيها) وبقوة معقولة', async ({ page }) => {
  await open(page, 'dark');
  const wall = await page.locator('.page-sections--home').evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    opacity: parseFloat(getComputedStyle(el, '::before').opacity),
    image: getComputedStyle(el, '::before').backgroundImage,
  }));
  expect(wall.background).toBe('rgba(0, 0, 0, 0)');
  expect(wall.opacity).toBeGreaterThanOrEqual(0.25);
  expect(wall.image).toContain('/patterns/brand-pattern-night.svg');
});
