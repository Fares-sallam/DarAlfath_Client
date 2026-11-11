import { test, expect, type Page, type Route } from '../fixtures';

// The company links page (/links). Its two tables are answered here (nothing is read from or written to
// the database), so the tests run the same whether or not the page has been set up in the dashboard yet.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

let seq = 0;
const block = (kind: string, patch: Record<string, unknown> = {}) => {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, kind, sort_order: seq * 10, is_active: true, starts_at: null, ends_at: null,
    title: '', body: '', url: null, cta_label: null, image_url: null, icon: null, badge: null, coupon_code: null, look: {}, ...patch,
  };
};

const SETTINGS = {
  is_enabled: true, title: '', tagline: 'ننشر المعرفة الهادفة ونبني جسرًا واسعًا من الكتب الأصيلة', show_logo: true, button_shape: 'rounded',
  background: 'pattern', footer_text: '© 2026 دار الفتح', seo_title: '', seo_description: '', share_image_url: null,
};

const inFiveDays = () => new Date(Date.now() + 5 * 864e5).toISOString();

const page1 = () => {
  seq = 0;
  return [
    block('link', { title: 'تسوّق من المتجر', body: 'كتب دار الفتح', url: '/', icon: 'store', look: { style: 'primary', display: 'button' } }),
    block('link', { title: 'تطبيق أندرويد', url: 'https://play.google.com/store/apps/details?id=x', icon: 'googleplay', badge: 'جديد', look: { style: 'teal', display: 'button' } }),
    block('link', { title: 'تواصل معنا', url: '/contact', icon: 'email', look: { style: 'mint', display: 'button' } }),
    block('offer', { title: 'عرض الدورة الصيفية', body: 'خصم على كل الكتب', badge: 'خصم 20%', coupon_code: 'DARALFATH20', cta_label: 'اطلب الآن', url: '/books?sale=1', ends_at: inFiveDays(), look: { style: 'primary', showEnd: true } }),
    block('divider', { look: { type: 'pattern', length: 'medium' } }),
    block('heading', { title: 'تابعنا', look: { align: 'center', size: 'md' } }),
    block('link', { title: 'فيسبوك', url: 'https://www.facebook.com/darolfath', icon: 'facebook', look: { style: 'primary', display: 'icon' } }),
    block('link', { title: 'واتساب', url: 'https://wa.me/201010848033', icon: 'whatsapp', look: { style: 'primary', display: 'icon' } }),
    block('link', { title: 'يوتيوب', url: 'https://www.youtube.com/@darolfath', icon: 'youtube', look: { style: 'primary', display: 'icon' } }),
    block('divider', { look: { type: 'band', length: 'long' } }),
    block('text', { body: 'دار الفتح للنشر والتوزيع', look: { align: 'center', size: 'md' } }),
  ];
};

async function setUp(page: Page, opts: { blocks?: unknown[]; settings?: Record<string, unknown>; fail?: boolean } = {}) {
  const blocks = opts.blocks ?? page1();
  // light unless the visitor has already chosen (so a reload keeps their choice)
  await page.addInitScript(() => { try { if (!localStorage.getItem('daralfath-theme')) localStorage.setItem('daralfath-theme', 'light'); } catch { /* private mode */ } });
  await page.route('**/rest/v1/links_page_settings*', (route) =>
    opts.fail ? route.fulfill({ status: 500, body: 'down' }) : json(route, { ...SETTINGS, ...opts.settings }));
  await page.route('**/rest/v1/links_page_blocks*', (route) =>
    opts.fail ? route.fulfill({ status: 500, body: 'down' }) : json(route, blocks));
}

test('الصفحة: الشعار والسطر التعريفي، والعناصر بترتيبها، والأيقونات صف واحد، والفواصل', async ({ page }) => {
  await setUp(page);
  await page.goto('/links');

  const root = page.locator('.lp-root');
  await expect(root).toHaveAttribute('data-lp-theme', 'light');
  await expect(page.locator('.lp-logo__img--day')).toBeVisible();
  await expect(page.locator('.lp-logo__img--night')).toBeHidden();
  await expect(page.locator('.lp-tagline')).toContainText('ننشر المعرفة الهادفة');
  // one h1, for screen readers, even with no visible title
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('دار الفتح للنشر والتوزيع');

  // the order the dashboard gave
  const order = await page.locator('.lp-list > .lp-item').evaluateAll((els) =>
    els.map((el) => el.querySelector('.lp-btn__title, .lp-offer__title, .lp-heading, .lp-icons, .lp-divider, .lp-text')?.className.split(' ')[0] ?? '?'));
  expect(order).toEqual(['lp-btn__title', 'lp-btn__title', 'lp-btn__title', 'lp-offer__title', 'lp-divider', 'lp-heading', 'lp-icons', 'lp-divider', 'lp-text']);

  // the three social links touch, so they are one row
  await expect(page.locator('.lp-icons')).toHaveCount(1);
  await expect(page.locator('.lp-icons a')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'فيسبوك' })).toHaveAttribute('href', 'https://www.facebook.com/darolfath');
  await expect(page.locator('.lp-divider--pattern')).toHaveCount(1);
  await expect(page.locator('.lp-divider--band.lp-len-long')).toHaveCount(1);
  await expect(page.locator('.lp-frieze')).toBeVisible();
  await expect(page.locator('.lp-footer')).toContainText('© 2026 دار الفتح');
});

test('الروابط: الخارجي بيفتح في تبويب جديد بأمان، والداخلي في نفس التبويب', async ({ page }) => {
  await setUp(page);
  await page.goto('/links');

  const external = page.getByRole('link', { name: /تطبيق أندرويد/ });
  await expect(external).toHaveAttribute('target', '_blank');
  await expect(external).toHaveAttribute('rel', /noopener/);
  await expect(external).toContainText('جديد');
  const internal = page.getByRole('link', { name: /تسوّق من المتجر/ });
  await expect(internal).not.toHaveAttribute('target', /.+/);
  await expect(internal).toHaveAttribute('href', '/');
});

test('رابط داخلي: بينقل لصفحة المتجر من غير تحميل جديد', async ({ page }) => {
  await setUp(page);
  await page.goto('/links');
  await page.evaluate(() => { (window as unknown as { __stayed: number }).__stayed = 1; });

  await page.getByRole('link', { name: /تواصل معنا/ }).click();
  await expect(page).toHaveURL(/\/contact$/);
  // the same page of the app: nothing was reloaded
  expect(await page.evaluate(() => (window as unknown as { __stayed?: number }).__stayed)).toBe(1);
});

test('العرض: الكود بيتنسخ بضغطة، وتاريخ الانتهاء والزر ظاهرين', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setUp(page);
  await page.goto('/links');

  const offer = page.locator('.lp-offer');
  await expect(offer.locator('.lp-offer__title')).toHaveText('عرض الدورة الصيفية');
  await expect(offer.locator('.lp-badge--solid')).toHaveText('خصم 20%');
  await expect(offer.locator('.lp-offer__ends')).toContainText('ينتهي يوم');
  await expect(offer.getByRole('link', { name: /اطلب الآن/ })).toHaveAttribute('href', '/books?sale=1');

  await expect(offer.locator('.lp-coupon__code')).toHaveText('DARALFATH20');
  await offer.getByRole('button', { name: 'نسخ' }).click();
  await expect(offer.getByRole('button', { name: 'تم النسخ' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('DARALFATH20');
});

test('أمان: رابط javascript: أو //موقع أو صورة http مش بيتعرضوا حتى لو وصلوا من قاعدة البيانات', async ({ page }) => {
  seq = 0;
  const dialogs: string[] = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
  await setUp(page, {
    blocks: [
      block('link', { title: 'سليم', url: '/books' }),
      block('link', { title: 'سكريبت', url: 'javascript:alert(1)' }),
      block('link', { title: 'سكريبت كبير', url: 'JaVaScRiPt:alert(2)' }),
      block('link', { title: 'بيانات', url: 'data:text/html,<script>alert(3)</script>' }),
      block('link', { title: 'برا المتجر', url: '//evil.example' }),
      block('link', { title: 'شرطة عكسية', url: '/\\evil.example' }),
      block('link', { title: 'مسافة', url: 'https://a b.example' }),
      block('image', { title: 'صورة غير آمنة', image_url: 'http://evil.example/a.png' }),
      block('image', { title: 'صورة سكريبت', image_url: 'javascript:alert(4)' }),
      block('offer', { title: 'عرض', url: 'javascript:alert(5)', cta_label: 'اضغط' }),
    ],
  });
  await page.goto('/links');

  await expect(page.getByRole('link', { name: /سليم/ })).toBeVisible();
  for (const bad of ['سكريبت', 'سكريبت كبير', 'بيانات', 'برا المتجر', 'شرطة عكسية', 'مسافة']) {
    await expect(page.getByText(bad, { exact: true })).toHaveCount(0);
  }
  await expect(page.locator('.lp-image')).toHaveCount(0);
  // the offer card is drawn, but without a button to a bad address
  await expect(page.locator('.lp-offer')).toHaveCount(1);
  await expect(page.locator('.lp-offer').getByRole('link')).toHaveCount(0);
  const hrefs = await page.locator('.lp-root a').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  expect(hrefs.filter((h) => /^\s*(javascript|data|vbscript):/i.test(h ?? '') || (h ?? '').startsWith('//'))).toEqual([]);
  expect(dialogs).toEqual([]);
});

test('الجدولة: العنصر المخفي أو اللي لسه ما بدأش أو انتهى مش بيظهر حتى لو القاعدة رجّعته', async ({ page }) => {
  seq = 0;
  const hour = 3_600_000;
  await setUp(page, {
    blocks: [
      block('link', { title: 'ظاهر', url: '/books' }),
      block('link', { title: 'مخفي', url: '/books', is_active: false }),
      block('link', { title: 'لسه', url: '/books', starts_at: new Date(Date.now() + hour).toISOString() }),
      block('link', { title: 'انتهى', url: '/books', ends_at: new Date(Date.now() - hour).toISOString() }),
      block('link', { title: 'في موعده', url: '/books', starts_at: new Date(Date.now() - hour).toISOString(), ends_at: new Date(Date.now() + hour).toISOString() }),
    ],
  });
  await page.goto('/links');
  await expect(page.locator('.lp-btn__title')).toHaveText(['ظاهر', 'في موعده']);
});

test('الصفحة مقفولة من لوحة التحكم: رسالة وزر للمتجر، وبعيدة عن نتايج البحث', async ({ page }) => {
  await setUp(page, { settings: { is_enabled: false } });
  await page.goto('/links');
  await expect(page.getByRole('heading', { name: 'الصفحة غير متاحة دلوقتي' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'زيارة المتجر' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('.lp-btn__title')).toHaveText(['زيارة المتجر']);
});

test('قاعدة البيانات مش بترد: الصفحة بتفتح بزرّين، المتجر وتواصل معنا', async ({ page }) => {
  await setUp(page, { fail: true });
  await page.goto('/links');
  await expect(page.locator('.lp-btn__title')).toHaveText(['تسوّق من المتجر', 'تواصل معنا']);
  await expect(page.locator('.lp-logo__img--day')).toBeVisible();
});

test('صفحة من غير عناصر: بتفتح بزرّين بدل ما تبقى فاضية', async ({ page }) => {
  await setUp(page, { blocks: [] });
  await page.goto('/links');
  await expect(page.locator('.lp-btn__title')).toHaveText(['تسوّق من المتجر', 'تواصل معنا']);
});

test('فاتح وليلي: الزرار بيبدّل، والاختيار بيفضل بعد التحديث', async ({ page }) => {
  await setUp(page);
  await page.goto('/links');
  const root = page.locator('.lp-root');
  await expect(root).toHaveAttribute('data-lp-theme', 'light');

  await page.getByRole('button', { name: 'التبديل إلى المظهر الليلي' }).click();
  await expect(root).toHaveAttribute('data-lp-theme', 'dark');
  await expect(page.locator('.lp-logo__img--night')).toBeVisible();
  await expect(page.locator('.lp-logo__img--day')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('daralfath-theme'))).toBe('dark');

  // the choice survives a reload
  await page.reload();
  await expect(page.locator('.lp-root')).toHaveAttribute('data-lp-theme', 'dark');
});

test('الشكل: كبسولة أو حواف حادة، وخلفية سادة', async ({ page }) => {
  await setUp(page, { settings: { button_shape: 'pill', background: 'plain', show_logo: false, title: 'روابط دار الفتح' } });
  await page.goto('/links');
  const root = page.locator('.lp-root');
  await expect(root).toHaveClass(/lp-shape-pill/);
  await expect(root).not.toHaveClass(/lp-bg-pattern/);
  await expect(page.locator('.lp-logo')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('روابط دار الفتح');
  const radius = await page.locator('.lp-btn').first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(parseFloat(radius)).toBeGreaterThan(100); // a pill
});

test('عنوان الصفحة ووصفها: من الإعدادات، أو الافتراضي', async ({ page }) => {
  await setUp(page, { settings: { seo_title: 'روابط دار الفتح الرسمية', seo_description: 'كل حساباتنا في مكان واحد' } });
  await page.goto('/links');
  await expect(page).toHaveTitle('روابط دار الفتح الرسمية');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'كل حساباتنا في مكان واحد');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/links$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^index/);

  const other = await page.context().newPage();
  await setUp(other);
  await other.goto('/links');
  await expect(other).toHaveTitle(/روابط دار الفتح — دار الفتح للنشر والتوزيع/);
});

test('موبايل: الصفحة ما بتعملش سكرول أفقي، وكل الأزرار بحجم يتضغط', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await setUp(page);
  await page.goto('/links');
  await expect(page.locator('.lp-btn').first()).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const target of await page.locator('.lp-btn, .lp-iconbtn').all()) {
    const box = (await target.boundingBox())!;
    expect(box.height, await target.innerText()).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }
});

test('الوصول: أيقونات السوشيال ليها أسماء، ومفيش حاجة مخفية بتاخد تركيز', async ({ page }) => {
  await setUp(page);
  await page.goto('/links');
  for (const name of ['فيسبوك', 'واتساب', 'يوتيوب']) {
    await expect(page.locator('.lp-icons').getByRole('link', { name })).toBeVisible();
  }
  // a screen reader is told which links open elsewhere
  await expect(page.getByRole('link', { name: /تطبيق أندرويد/ })).toContainText('يفتح في تبويب جديد');
});
