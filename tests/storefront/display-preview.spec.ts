import { test, expect, type Page } from '../fixtures';

// The dashboard's live preview of «تفاصيل العرض»: the website opened with ?preview=display takes the draft the dashboard sends
// (by message) and draws it on its real cards, book page and footer. Read-only; the saved settings are never touched.
// In development the page's own address is trusted like the dashboard's, so a message posted from the page itself stands in for
// the dashboard's. (The real books are read; nothing is written.)

const MESSAGE = 'daralfath:display-preview';
const send = (page: Page, message: Record<string, unknown>) => page.evaluate((m) => window.postMessage({ type: 'daralfath:display-preview', ...m }, window.location.origin), message);
const cards = (page: Page) => page.locator('article.book-card');

async function openPreview(page: Page, path = '/books') {
  await page.goto(`${path}?preview=display`);
  await expect(cards(page).first()).toBeVisible({ timeout: 20_000 });
}

test('المعاينة: الكروت بتتغير بالمسودة اللي بتجيلها، من غير ما يتحفظ حاجة', async ({ page }) => {
  await openPreview(page);
  await expect(page.locator('.book-card__share').first()).toBeVisible();
  await expect(page.locator('.book-card__fav').first()).toBeVisible();

  await send(page, { display: { card: { show: { share: { web: false, app: false }, wishlist: { web: false, app: true }, type: { web: false, app: true } } } } });
  await expect(page.locator('.book-card__share')).toHaveCount(0);
  await expect(page.locator('.book-card__fav')).toHaveCount(0);
  await expect(page.locator('.book-card__badges span')).toHaveCount(0);

  // a later draft replaces the earlier one (an empty one is the designed look)
  await send(page, { display: {} });
  await expect(page.locator('.book-card__share').first()).toBeVisible();
  await expect(page.locator('.book-card__fav').first()).toBeVisible();

  // a message that says nothing about the draft (only moves the page) leaves it as it is; an explicit null goes back to the saved ones
  await send(page, { display: { card: { show: { share: { web: false, app: false } } } } });
  await expect(page.locator('.book-card__share')).toHaveCount(0);
  await send(page, { scroll: 'top' });
  await page.waitForTimeout(500);
  await expect(page.locator('.book-card__share')).toHaveCount(0);
  await send(page, { display: null });
  await expect(page.locator('.book-card__share').first()).toBeVisible();
});

test('المعاينة: عدد الكتب في الصف، وشارة «جديد»، وشكل الخصم', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPreview(page);
  await send(page, { display: { card: { perRow: { desktop: 3 }, show: { isNew: { web: true, app: true } }, newDays: 365 } } });
  await expect(page.locator('html')).toHaveAttribute('data-cols-d', '3');
  await expect.poll(() => page.locator('.books-grid--catalog').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length)).toBe(3);
  await expect.poll(() => page.locator('.book-card__flag').count(), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('المعاينة: صفحة الكتاب (شارات الثقة والمواصفات) بالتنقل اللي بتطلبه اللوحة، والمسودة بتفضل بعد التنقل', async ({ page }) => {
  await openPreview(page);
  await send(page, { display: { page: { trust: [{ icon: 'return', text: 'استرجاع خلال 14 يوم' }], show: { publisher: { web: false, app: true } } } } });
  await cards(page).first().click();
  await page.waitForURL(/\/book\//);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.getByTestId('book-trust')).toContainText('استرجاع خلال 14 يوم');
  await page.getByRole('button', { name: 'المواصفات' }).click();
  await expect(page.locator('[data-spec="publisher"]')).toHaveCount(0);

  // the dashboard moves the page: back to the list, then to the book again; the draft is still there
  await send(page, { navigate: '/books' });
  await expect(cards(page).first()).toBeVisible();
  await expect(page).toHaveURL(/\/books$/);
  await send(page, { navigate: `/book/${id}` });
  await expect(page.getByTestId('book-trust')).toContainText('استرجاع خلال 14 يوم');
  // a page that is not one of the preview's is refused
  await send(page, { navigate: '/account' });
  await expect(page).toHaveURL(new RegExp(`/book/${id}$`));
});

test('المعاينة: التذييل بأعمدته وسطريه من المسودة، وبيتمرّر له، وروابطه الخارجية مبتودّيش بره', async ({ page }) => {
  await openPreview(page);
  await send(page, {
    navigate: '/',
    scroll: 'footer',
    display: {
      footer: {
        columns: [{ title: 'روابطنا', links: [{ label: 'موقعنا', url: 'https://example.com/x' }, { label: 'الكتب', url: '/books' }, { label: 'خطر', url: 'javascript:alert(1)' }] }],
        showContact: false,
        copyright: 'كل الحقوق © {year}',
        note: '',
      },
    },
  });
  const footer = page.locator('.site-footer');
  await expect(footer).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('footer-col-0').locator('h3')).toHaveText('روابطنا');
  await expect(page.getByTestId('footer-col-0').locator('a')).toHaveCount(2);
  await expect(page.getByTestId('footer-col-1')).toHaveCount(0);
  await expect(page.getByTestId('footer-contact')).toHaveCount(0);
  await expect(page.getByTestId('footer-bottom')).toHaveText(`كل الحقوق © ${new Date().getFullYear()}`);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);

  // a link that leaves the store does nothing in the preview (it must not take the frame away)
  const before = page.url();
  await page.getByTestId('footer-col-0').getByRole('link', { name: 'موقعنا' }).click();
  await page.waitForTimeout(500);
  expect(page.url()).toBe(before);
});

test('من غير علامة المعاينة: المتجر العادي مبيسمعش لأي رسالة', async ({ page }) => {
  await page.goto('/books');
  await expect(cards(page).first()).toBeVisible({ timeout: 20_000 });
  await send(page, { display: { card: { show: { share: { web: false, app: false } } } }, navigate: '/' });
  await page.waitForTimeout(800);
  await expect(page.locator('.book-card__share').first()).toBeVisible();
  await expect(page).toHaveURL(/\/books$/);
});

test('المعاينة: رسالة من نوع تاني أو رسالة بقيم غلط مبتكسّرش الصفحة', async ({ page }) => {
  await openPreview(page);
  await page.evaluate(() => window.postMessage({ type: 'something-else', display: { card: { tilt: false } } }, window.location.origin));
  await send(page, { display: { card: { newDays: 99999, perRow: { desktop: 99 }, show: 'nope' }, page: { trust: 'x' }, footer: { columns: 7 } }, navigate: { evil: true } });
  await page.waitForTimeout(600);
  await expect(cards(page).first()).toBeVisible();
  await expect(page.locator('.book-card__share').first()).toBeVisible();
  void MESSAGE;
});
