import { test, expect, type Page } from '../fixtures';

// «تفاصيل العرض» (the dashboard's مظهر المتجر): what a book card, a book's page and the footer show. The saved row is answered
// with a chosen `display` (the real books are read, nothing is written). With nothing chosen the store looks as it always did.

const ROW = { pattern_strength: 100, strip_arrangement: 'uniform', home_sections: [], button_styles: {} };

/** Answers the saved appearance row with this `display` (a route set on the page wins over the default one). */
async function savedDisplay(page: Page, display: unknown) {
  await page.route('**/rest/v1/storefront_appearance*', (route) => {
    const method = route.request().method();
    if (method !== 'GET' && method !== 'HEAD') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ...ROW, display }),
    });
  });
}

const cards = (page: Page) => page.locator('article.book-card');

async function openBooks(page: Page) {
  await page.goto('/books');
  await expect(cards(page).first()).toBeVisible({ timeout: 20_000 });
}

const year = new Date().getFullYear();

test.describe('تفاصيل العرض: الكارت', () => {
  test('من غير اختيارات: الكارت زي ما كان (نوع، تصنيف، نجوم، مفضلة، مشاركة) ومفيش شارات «جديد» أو «آخر نسخ»', async ({ page }) => {
    await savedDisplay(page, {});
    await openBooks(page);
    await expect(page.locator('.book-card__fav').first()).toBeVisible();
    await expect(page.locator('.book-card__share').first()).toBeVisible();
    await expect(page.locator('.book-card__badges span').first()).toBeVisible();
    await expect(page.locator('.book-card__series').first()).toBeVisible();
    await expect(page.locator('.book-card__rating').first()).toBeVisible();
    await expect(page.locator('.book-card__flags')).toHaveCount(0);
  });

  test('كل عنصر ممكن يتقفل لوحده في الموقع: النوع والتصنيف والنجوم والمفضلة والمشاركة', async ({ page }) => {
    const off = { web: false, app: true };
    await savedDisplay(page, { card: { show: { type: off, category: off, rating: off, wishlist: off, share: off, editions: off } } });
    await openBooks(page);
    await expect(page.locator('.book-card__fav')).toHaveCount(0);
    await expect(page.locator('.book-card__share')).toHaveCount(0);
    await expect(page.locator('.book-card__badges')).toHaveCount(0);
    await expect(page.locator('.book-card__series')).toHaveCount(0);
    await expect(page.locator('.book-card__rating')).toHaveCount(0);
    // what stays: the title and the price
    await expect(cards(page).first().locator('h3')).toBeVisible();
    await expect(cards(page).first().locator('.book-card__price')).toBeVisible();
  });

  test('مفتاح التطبيق مالوش أثر في الموقع: قفل المفضلة للتطبيق بس بيسيبها ظاهرة هنا', async ({ page }) => {
    await savedDisplay(page, { card: { show: { wishlist: { web: true, app: false }, share: { web: true, app: false } } } });
    await openBooks(page);
    await expect(page.locator('.book-card__fav').first()).toBeVisible();
    await expect(page.locator('.book-card__share').first()).toBeVisible();
  });

  test('شارة «جديد» و«آخر نسخ» بتظهر لما تتفتح، وشارة الخصم بتتكتب «وفّر X»', async ({ page }) => {
    await savedDisplay(page, {
      card: { show: { isNew: { web: true, app: false }, lowStock: { web: true, app: false } }, newDays: 365, lowStockAt: 50, discountStyle: 'amount' },
    });
    await openBooks(page);
    await expect.poll(() => page.locator('.book-card__flag').count(), { timeout: 15_000 }).toBeGreaterThan(0);
    // a flag says what it is
    const texts = await page.locator('.book-card__flag').allTextContents();
    expect(texts.every((t) => t.trim() === 'جديد' || /^آخر /.test(t.trim()))).toBe(true);

    await page.goto('/books?sale=1&sort=discount');
    const badge = page.getByTestId('card-discount').first();
    if (await badge.count()) await expect(badge).toContainText('وفّر');
  });

  test('الإمالة: لما تتقفل الكارت مش بيتحرك مع الماوس', async ({ page }) => {
    await savedDisplay(page, { card: { tilt: false } });
    await openBooks(page);
    const card = cards(page).first();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.2, { steps: 5 });
    await page.waitForTimeout(500);
    const ry = await card.locator('.book-card__cover').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--ry'));
    expect(ry === '' || ry === '0deg').toBe(true);
  });
});

test.describe('تفاصيل العرض: كتب في الصف', () => {
  const columns = (page: Page) => page.locator('.books-grid--catalog').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);

  test('كمبيوتر: العدد المختار هو عدد الأعمدة، ومن غير اختيار مفيش حاجة بتتحط على الصفحة', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await savedDisplay(page, { card: { perRow: { desktop: 4 } } });
    await openBooks(page);
    await expect(page.locator('html')).toHaveAttribute('data-cols-d', '4');
    expect(await columns(page)).toBe(4);

    const fresh = await page.context().newPage();
    await fresh.setViewportSize({ width: 1440, height: 900 });
    await savedDisplay(fresh, {});
    await fresh.goto('/books');
    await expect(cards(fresh).first()).toBeVisible({ timeout: 20_000 });
    await expect(fresh.locator('html')).not.toHaveAttribute('data-cols-d', /.+/);
  });

  test('موبايل: كتاب واحد في الصف أو اتنين', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await savedDisplay(page, { card: { perRow: { mobile: 1 } } });
    await openBooks(page);
    expect(await columns(page)).toBe(1);

    await page.unroute('**/rest/v1/storefront_appearance*');
    await savedDisplay(page, { card: { perRow: { mobile: 2 } } });
    await page.reload();
    await expect(cards(page).first()).toBeVisible({ timeout: 20_000 });
    expect(await columns(page)).toBe(2);
  });
});

test.describe('تفاصيل العرض: صفحة الكتاب', () => {
  async function openFirstBook(page: Page) {
    await openBooks(page);
    await cards(page).first().click();
    await page.waitForURL(/\/book\//);
    await expect(page.locator('.bk3-title')).toBeVisible({ timeout: 15_000 });
  }

  test('من غير اختيارات: شارتا «منتج أصلي» و«شحن سريع» والمواصفات كاملة ومفيش تنبيه مخزون', async ({ page }) => {
    await savedDisplay(page, {});
    await openFirstBook(page);
    const trust = page.getByTestId('book-trust');
    await expect(trust).toContainText('منتج أصلي');
    await expect(trust).toContainText('شحن سريع');
    await expect(page.getByTestId('book-stock-hint')).toHaveCount(0);
    await page.getByRole('button', { name: 'المواصفات' }).click();
    for (const spec of ['publisher', 'pages', 'year', 'category', 'type']) await expect(page.locator(`[data-spec="${spec}"]`)).toBeVisible();
  });

  test('شارات الثقة بتتكتب من اللوحة: كلمة وأيقونة، ولو اتقفل الشريط بيختفي', async ({ page }) => {
    await savedDisplay(page, { page: { trust: [{ icon: 'return', text: 'استرجاع خلال 14 يوم' }, { icon: 'cash', text: 'الدفع عند الاستلام' }] } });
    await openFirstBook(page);
    const trust = page.getByTestId('book-trust');
    await expect(trust).toContainText('استرجاع خلال 14 يوم');
    await expect(trust).toContainText('الدفع عند الاستلام');
    await expect(trust).not.toContainText('منتج أصلي');
    await expect(trust.locator('.bk3-trust__i svg').first()).toBeVisible();

    const closed = await page.context().newPage();
    await savedDisplay(closed, { page: { show: { trust: { web: false, app: false } } } });
    await closed.goto(page.url());
    await expect(closed.locator('.bk3-title')).toBeVisible({ timeout: 15_000 });
    await expect(closed.getByTestId('book-trust')).toHaveCount(0);
  });

  test('صفوف المواصفات: اللي اتقفل مش بيظهر', async ({ page }) => {
    const off = { web: false, app: true };
    await savedDisplay(page, { page: { show: { publisher: off, pages: off, weight: off } } });
    await openFirstBook(page);
    await page.getByRole('button', { name: 'المواصفات' }).click();
    await expect(page.locator('[data-spec="year"]')).toBeVisible();
    for (const spec of ['publisher', 'pages', 'weight']) await expect(page.locator(`[data-spec="${spec}"]`)).toHaveCount(0);
  });

  test('تنبيه «باقي X نسخ فقط»: بيظهر لما المخزون يقل عن الحد، بنفس الرقم اللي على الكارت', async ({ page }) => {
    await savedDisplay(page, { card: { show: { lowStock: { web: true, app: true } }, lowStockAt: 50 }, page: { show: { stockHint: { web: true, app: true } } } });
    await openBooks(page);
    const low = page.locator('article.book-card:has(.book-card__flag--low)').first();
    await expect(low).toBeVisible({ timeout: 15_000 });
    const number = (await low.locator('.book-card__flag--low').innerText()).match(/[٠-٩]+/)?.[0];
    expect(number).toBeTruthy();
    await low.click();
    await page.waitForURL(/\/book\//);
    const hint = page.getByTestId('book-stock-hint');
    await expect(hint).toBeVisible({ timeout: 15_000 });
    await expect(hint).toContainText(number!);
    await expect(hint).toContainText('فقط');
  });
});

test.describe('تفاصيل العرض: التذييل', () => {
  test('من غير اختيارات: العمودين والتواصل والسطرين زي ما كانوا، والسنة هي السنة الحالية', async ({ page }) => {
    await savedDisplay(page, {});
    await page.goto('/');
    const footer = page.locator('.site-footer');
    await expect(footer).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('footer-col-0')).toContainText('روابط سريعة');
    await expect(page.getByTestId('footer-col-0').locator('a')).toHaveCount(5);
    await expect(page.getByTestId('footer-col-1')).toContainText('خدمة العملاء');
    await expect(page.getByTestId('footer-col-1').locator('a')).toHaveCount(4);
    await expect(page.getByTestId('footer-contact')).toBeVisible();
    await expect(page.getByTestId('footer-bottom')).toContainText(`جميع الحقوق محفوظة © ${year} دار الفتح`);
    await expect(page.getByTestId('footer-bottom')).toContainText('صُنع بعناية');
    // the designed grid is untouched
    await expect(page.locator('.site-footer__grid')).not.toHaveAttribute('data-custom', /.*/);
  });

  test('الأعمدة والروابط بتتكتب من اللوحة: رابط جوه المتجر، موقع خارجي، إيميل، وعنوان خطر بيتشال', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await savedDisplay(page, {
      footer: {
        columns: [{
          title: 'روابطنا',
          links: [
            { label: 'الكتب', url: '/books' },
            { label: 'موقعنا', url: 'https://example.com/x' },
            { label: 'راسلنا', url: 'mailto:info@example.com' },
            { label: 'خطر', url: 'javascript:alert(1)' },
          ],
        }],
        showContact: false,
        copyright: 'كل الحقوق © {year}',
        note: '',
      },
    });
    await page.goto('/');
    await expect(page.locator('.site-footer')).toBeVisible({ timeout: 20_000 });

    const col = page.getByTestId('footer-col-0');
    await expect(col.locator('h3')).toHaveText('روابطنا');
    await expect(col.locator('a')).toHaveCount(3);
    await expect(col.getByRole('link', { name: 'الكتب' })).toHaveAttribute('href', /\/books$/);
    await expect(col.getByRole('link', { name: 'موقعنا' })).toHaveAttribute('target', '_blank');
    await expect(col.getByRole('link', { name: 'موقعنا' })).toHaveAttribute('rel', /noopener/);
    await expect(col.getByRole('link', { name: 'راسلنا' })).toHaveAttribute('href', 'mailto:info@example.com');
    await expect(page.locator('.site-footer a[href^="javascript"]')).toHaveCount(0);

    await expect(page.getByTestId('footer-col-1')).toHaveCount(0);
    await expect(page.getByTestId('footer-contact')).toHaveCount(0);
    await expect(page.getByTestId('footer-bottom')).toHaveText(`كل الحقوق © ${year}`);

    // the grid follows the columns that are there: the brand block and one column
    const grid = page.locator('.site-footer__grid');
    await expect(grid).toHaveAttribute('data-custom', '');
    const count = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(count).toBe(2);
  });

  test('الأعمدة كلها اتمسحت: التذييل بيفضل فيه اسم الدار وبيانات التواصل ومفيش أعمدة فاضية', async ({ page }) => {
    await savedDisplay(page, { footer: { columns: [] } });
    await page.goto('/');
    await expect(page.locator('.site-footer')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('footer-col-0')).toHaveCount(0);
    await expect(page.getByTestId('footer-contact')).toBeVisible();
  });
});
