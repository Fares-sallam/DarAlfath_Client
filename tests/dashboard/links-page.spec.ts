import { test, expect, type Page, type Route } from '../fixtures';

// "إدارة الصفحة والروابط": the company links page the store shows at /links. The two tables are answered
// here from a small in-memory copy (the new tables' rows; the rest of the dashboard is the real one), and
// every write is recorded and applied to that copy instead of reaching the database.

interface Write { method: string; url: string; body: any }
interface Row { id: string; kind: string; sort_order: number; [key: string]: unknown }

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

let seq = 0;
const block = (kind: string, patch: Record<string, unknown> = {}): Row => {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, kind, sort_order: seq * 10, is_active: true, starts_at: null, ends_at: null,
    title: '', body: '', url: null, cta_label: null, image_url: null, icon: null, badge: null, coupon_code: null, look: {}, ...patch,
  };
};

/** The page the migration seeds: store, contact, a hidden app slot, a divider, a heading and three social icons. */
const seeded = () => {
  seq = 0;
  return [
    block('link', { title: 'تسوّق من المتجر', body: 'كتب دار الفتح الورقية والرقمية', url: '/', icon: 'store', look: { style: 'primary', display: 'button' } }),
    block('link', { title: 'تواصل معنا', body: 'لأي استفسار', url: '/contact', icon: 'email', look: { style: 'mint', display: 'button' } }),
    block('link', { title: 'حمّل تطبيق دار الفتح', url: null, icon: 'app', is_active: false, look: { style: 'teal', display: 'button' } }),
    block('divider', { look: { type: 'pattern', length: 'medium' } }),
    block('heading', { title: 'تابعنا', look: { align: 'center', size: 'md' } }),
    block('link', { title: 'فيسبوك', url: 'https://www.facebook.com/darolfath', icon: 'facebook', look: { style: 'primary', display: 'icon' } }),
    block('link', { title: 'واتساب', url: 'https://wa.me/201010848033', icon: 'whatsapp', look: { style: 'primary', display: 'icon' } }),
    block('link', { title: 'يوتيوب', url: 'https://www.youtube.com/@darolfath', icon: 'youtube', look: { style: 'primary', display: 'icon' } }),
  ];
};

const SETTINGS = {
  is_enabled: true, title: '', tagline: 'ننشر المعرفة الهادفة', show_logo: true, button_shape: 'rounded', background: 'pattern',
  footer_text: '', seo_title: '', seo_description: '', share_image_url: null,
};

async function setUp(page: Page, blocks: Row[] = seeded(), settings: Record<string, unknown> = SETTINGS) {
  const state = { blocks: [...blocks], settings: { ...settings } };
  const writes: Write[] = [];

  await page.route('**/rest/v1/links_page_settings*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') return json(route, state.settings);
    const body = req.postDataJSON();
    writes.push({ method: req.method(), url: req.url(), body });
    state.settings = { ...state.settings, ...body };
    return route.fulfill({ status: 201, body: '' });
  });

  await page.route('**/rest/v1/links_page_blocks*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      return json(route, [...state.blocks].sort((a, b) => a.sort_order - b.sort_order));
    }
    let body: any = null;
    try { body = req.postDataJSON(); } catch { /* a DELETE has no body */ }
    writes.push({ method: req.method(), url: req.url(), body });
    if (req.method() === 'POST') {
      for (const row of body as Row[]) {
        const at = state.blocks.findIndex((b) => b.id === row.id);
        if (at >= 0) state.blocks[at] = { ...state.blocks[at], ...row };
        else state.blocks.push(row);
      }
    } else if (req.method() === 'DELETE') {
      const ids = (/id=in\.\(([^)]*)\)/.exec(decodeURIComponent(req.url()))?.[1] ?? '').split(',');
      state.blocks = state.blocks.filter((b) => !ids.includes(b.id));
    }
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, body: '' });
  });

  // pictures: the upload is faked, and the public bucket answers with the suite's stand-in
  await page.route('**/storage/v1/object/site-assets/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"site-assets/links-page/x.png"}' }));

  return { state, writes };
}

const blocksOf = (page: Page) => page.getByTestId('links-block');
const preview = (page: Page) => page.getByTestId('links-preview');
const previewTitles = (page: Page) => preview(page).locator('.lp-btn__title');
const open = (page: Page, index: number) => blocksOf(page).nth(index).getByRole('button', { expanded: false }).first().click();
const field = (scope: ReturnType<Page['getByTestId']>, name: string) => scope.getByRole('group', { name, exact: true }).getByRole('textbox').first();
const saveBar = (page: Page) => page.getByTestId('links-save-bar');
const blockWrites = (writes: Write[]) => writes.filter((w) => w.url.includes('links_page_blocks') && w.method === 'POST');

test('القايمة الجانبية: «إدارة الصفحة والروابط» تحت «إدارة الإعلانات والأشرطة»، والصفحة بتعرض العناصر والمعاينة', async ({ page }) => {
  await setUp(page);
  await page.goto('/links-page');

  await expect(page.getByRole('heading', { name: 'إدارة الصفحة والروابط' }).first()).toBeVisible();
  const links = await page.locator('aside nav a').evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ''));
  const ads = links.findIndex((t) => t.includes('إدارة الإعلانات والأشرطة'));
  const mine = links.findIndex((t) => t.includes('إدارة الصفحة والروابط'));
  expect(mine).toBe(ads + 1);

  await expect(blocksOf(page)).toHaveCount(8);
  // the preview is what a visitor sees: the hidden app slot is not in it, the three icons are one row
  await expect(preview(page).getByRole('link', { name: /تسوّق من المتجر/ })).toBeVisible();
  await expect(preview(page).getByText('حمّل تطبيق دار الفتح')).toHaveCount(0);
  await expect(preview(page).locator('.lp-icons a')).toHaveCount(3);
  await expect(preview(page).locator('.lp-icons')).toHaveCount(1);
  await expect(preview(page).getByText('فيه 1 عنصر مخفي أو مجدول')).toBeVisible();
  await expect(saveBar(page)).toHaveCount(0);
});

test('التعديل بيظهر في المعاينة فورًا قبل الحفظ، والحفظ بيكتب كل العناصر بترتيبها', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/links-page');
  await expect(blocksOf(page)).toHaveCount(8);

  await open(page, 0);
  await field(blocksOf(page).nth(0), 'العنوان').fill('المتجر الرسمي');
  await expect(preview(page).getByRole('link', { name: /المتجر الرسمي/ })).toBeVisible();
  await expect(saveBar(page)).toBeVisible();
  expect(writes).toHaveLength(0); // nothing is written until it is saved

  await page.getByTestId('links-save').click();
  await expect(saveBar(page)).toHaveCount(0);

  const posts = blockWrites(writes);
  expect(posts).toHaveLength(1);
  const rows = posts[0].body as Row[];
  expect(rows).toHaveLength(8);
  expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(rows[0]).toMatchObject({ title: 'المتجر الرسمي', url: '/', icon: 'store', look: { style: 'primary', display: 'button' } });
  expect(writes.some((w) => w.url.includes('links_page_settings'))).toBe(false); // the page settings were not touched
  expect(writes.some((w) => w.method === 'DELETE')).toBe(false);
});

test('الترتيب: الأسهم بتبدّل العناصر في المعاينة والحفظ بيسجّل الترتيب الجديد', async ({ page }) => {
  const { writes, state } = await setUp(page);
  const [store, contact] = state.blocks;
  await page.goto('/links-page');
  await expect(blocksOf(page)).toHaveCount(8);
  await expect(previewTitles(page)).toHaveText(['تسوّق من المتجر', 'تواصل معنا']);

  await blocksOf(page).nth(0).getByRole('button', { name: 'نقل رابط لأسفل' }).click();
  await expect(previewTitles(page)).toHaveText(['تواصل معنا', 'تسوّق من المتجر']);

  await page.getByTestId('links-save').click();
  await expect(saveBar(page)).toHaveCount(0);
  const rows = blockWrites(writes)[0].body as Row[];
  expect(rows[0].id).toBe(contact.id);
  expect(rows[1].id).toBe(store.id);
  expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

test('الترتيب بالسحب: سحب أول عنصر تحت الثالث بيغيّر الترتيب', async ({ page }) => {
  await setUp(page);
  await page.goto('/links-page');
  await expect(blocksOf(page)).toHaveCount(8);

  // the first block (store) goes below the second (contact)
  await blocksOf(page).nth(0).locator('[draggable="true"]').dragTo(blocksOf(page).nth(1), { targetPosition: { x: 200, y: 40 } });
  await expect(previewTitles(page)).toHaveText(['تواصل معنا', 'تسوّق من المتجر']);
  await expect(saveBar(page)).toBeVisible();
});

test('إضافة سريعة: تيك توك بيجي ناقص رابط ومينفعش يتحفظ، ولما يتكتب الرابط بيتظبط ويتحفظ', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/links-page');
  await expect(blocksOf(page)).toHaveCount(8);

  await page.getByTestId('preset-tiktok').click();
  await expect(blocksOf(page)).toHaveCount(9);
  const added = blocksOf(page).nth(8);
  await expect(added.getByRole('alert')).toContainText('الرابط مطلوب');
  await expect(saveBar(page)).toContainText('عنصر محتاج تكملة');
  await expect(page.getByTestId('links-save')).toBeDisabled(); // nothing can be saved while something is missing

  const url = field(added, 'الرابط');
  await url.fill('tiktok.com/@darolfath');
  await url.blur();
  await expect(url).toHaveValue('https://tiktok.com/@darolfath'); // a bare address becomes a link
  await expect(added.getByRole('alert')).toHaveCount(0);
  await expect(preview(page).locator('.lp-icons a')).toHaveCount(4);

  await page.getByTestId('links-save').click();
  await expect(saveBar(page)).toHaveCount(0);
  const rows = blockWrites(writes)[0].body as Row[];
  expect(rows).toHaveLength(9);
  expect(rows[8]).toMatchObject({ kind: 'link', title: 'تيك توك', url: 'https://tiktok.com/@darolfath', icon: 'tiktok', sort_order: 8, look: { style: 'primary', display: 'icon' } });
});

test('أمان: رابط javascript: مش بيتقبل ومش بيتعرض', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/links-page');
  await open(page, 0);

  await field(blocksOf(page).nth(0), 'الرابط').fill('javascript:alert(1)');
  await expect(blocksOf(page).nth(0).getByRole('alert')).toContainText('مش صالح');
  await expect(preview(page).getByText('تسوّق من المتجر')).toHaveCount(0); // an unsafe link is never drawn
  await expect(page.getByTestId('links-save')).toBeDisabled();

  await field(blocksOf(page).nth(0), 'الرابط').fill('/books');
  await expect(blocksOf(page).nth(0).getByRole('alert')).toHaveCount(0);
  await expect(preview(page).getByText('تسوّق من المتجر')).toBeVisible();
  expect(writes).toHaveLength(0);
});

test('الحذف: بيتأكد الأول، والحذف بيتسجّل لما نحفظ', async ({ page }) => {
  const { writes, state } = await setUp(page);
  const contact = state.blocks[1];
  await page.goto('/links-page');
  await expect(blocksOf(page)).toHaveCount(8);

  page.once('dialog', (dialog) => dialog.dismiss());
  await blocksOf(page).nth(1).getByRole('button', { name: 'حذف رابط' }).click();
  await expect(blocksOf(page)).toHaveCount(8); // refused

  page.once('dialog', (dialog) => dialog.accept());
  await blocksOf(page).nth(1).getByRole('button', { name: 'حذف رابط' }).click();
  await expect(blocksOf(page)).toHaveCount(7);
  await expect(previewTitles(page)).toHaveText(['تسوّق من المتجر']);

  await page.getByTestId('links-save').click();
  await expect(saveBar(page)).toHaveCount(0);
  const deletes = writes.filter((w) => w.method === 'DELETE');
  expect(deletes).toHaveLength(1);
  expect(decodeURIComponent(deletes[0].url)).toContain(`id=in.(${contact.id})`);
  expect((blockWrites(writes)[0].body as Row[]).map((r) => r.id)).not.toContain(contact.id);
});

test('تراجع: بيرجّع الصفحة زي ما كانت محفوظة', async ({ page }) => {
  await setUp(page);
  await page.goto('/links-page');
  await open(page, 0);
  await field(blocksOf(page).nth(0), 'العنوان').fill('عنوان تاني');
  await expect(saveBar(page)).toBeVisible();

  await saveBar(page).getByRole('button', { name: 'تراجع' }).click();
  await expect(saveBar(page)).toHaveCount(0);
  await expect(previewTitles(page)).toHaveText(['تسوّق من المتجر', 'تواصل معنا']);
});

test('الفاصل: النوع والطول بيتطبقوا في المعاينة', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/links-page');
  await expect(blocksOf(page)).toHaveCount(8);

  await page.getByTestId('add-divider').click();
  const added = blocksOf(page).nth(8);
  await added.getByRole('radio', { name: 'شريط الباترن' }).click();
  await added.getByRole('radio', { name: 'طويل' }).click();
  await expect(preview(page).locator('.lp-divider--band.lp-len-long')).toHaveCount(1);

  await added.getByRole('radio', { name: 'خط متقطع' }).click();
  await added.getByRole('radio', { name: 'قصير' }).click();
  await expect(preview(page).locator('.lp-divider--dashed.lp-len-short')).toHaveCount(1);
  await expect(preview(page).locator('.lp-divider--band')).toHaveCount(0);

  await page.getByTestId('links-save').click();
  await expect(saveBar(page)).toHaveCount(0);
  const rows = blockWrites(writes)[0].body as Row[];
  expect(rows[8]).toMatchObject({ kind: 'divider', look: { type: 'dashed', length: 'short' } });
});

test('عرض: الكود والزر وتاريخ الانتهاء بيظهروا في المعاينة', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/links-page');
  await page.getByTestId('add-offer').click();
  const added = blocksOf(page).nth(8);
  await expect(added.getByRole('alert')).toContainText('عنوان العرض مطلوب');

  await field(added, 'عنوان العرض').fill('خصم الدورة الصيفية');
  await field(added, 'كود الخصم (اختياري)').fill('daralfath 20');
  await expect(field(added, 'كود الخصم (اختياري)')).toHaveValue('DARALFATH20'); // no spaces, capital letters
  await field(added, 'نص الزر (اختياري)').fill('اطلب الآن');
  await field(added, 'رابط الزر (اختياري)').fill('/books?sale=1');
  await expect(preview(page).getByText('خصم الدورة الصيفية')).toBeVisible();
  await expect(preview(page).locator('.lp-coupon__code')).toHaveText('DARALFATH20');
  await expect(preview(page).getByRole('link', { name: /اطلب الآن/ })).toHaveAttribute('href', '/books?sale=1');

  // "show the end" needs a date
  await added.locator('label', { has: page.getByRole('checkbox', { name: 'إظهار تاريخ الانتهاء' }) }).click();
  await expect(added.getByRole('alert')).toContainText('اختار تاريخ الانتهاء');
  const end = new Date(Date.now() + 5 * 864e5);
  const pad = (n: number) => String(n).padStart(2, '0');
  await added.getByLabel('يختفي في (اختياري)').fill(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T12:00`);
  await expect(added.getByRole('alert')).toHaveCount(0);
  await expect(preview(page).locator('.lp-offer__ends')).toContainText('ينتهي يوم');

  await page.getByTestId('links-save').click();
  await expect(saveBar(page)).toHaveCount(0);
  const row = (blockWrites(writes)[0].body as Row[])[8];
  expect(row).toMatchObject({ kind: 'offer', title: 'خصم الدورة الصيفية', coupon_code: 'DARALFATH20', cta_label: 'اطلب الآن', url: '/books?sale=1', look: { showEnd: true } });
  expect(typeof row.ends_at).toBe('string');
});

test('إعدادات الصفحة: شكل الأزرار والإيقاف بيتحفظوا في جدول الإعدادات بس', async ({ page }) => {
  const { writes } = await setUp(page);
  await page.goto('/links-page');
  await expect(blocksOf(page)).toHaveCount(8);

  await page.getByTestId('links-tab-settings').click();
  await page.getByRole('radio', { name: 'كبسولة' }).click();
  await expect(preview(page).locator('.lp-root')).toHaveClass(/lp-shape-pill/);
  await page.locator('label', { has: page.getByRole('checkbox', { name: 'إظهار الشعار' }) }).click();
  await expect(preview(page).locator('.lp-logo')).toHaveCount(0);
  await page.getByPlaceholder('مثال: روابط دار الفتح').fill('روابط دار الفتح');
  await expect(preview(page).getByRole('heading', { level: 1 })).toHaveText('روابط دار الفتح');

  await page.getByTestId('links-save').click();
  await expect(saveBar(page)).toHaveCount(0);
  const settingsWrites = writes.filter((w) => w.url.includes('links_page_settings'));
  expect(settingsWrites).toHaveLength(1);
  expect(settingsWrites[0].body).toMatchObject({ id: 1, button_shape: 'pill', show_logo: false, title: 'روابط دار الفتح', is_enabled: true });
});

test('المعاينة: فاتح وليلي', async ({ page }) => {
  await setUp(page);
  await page.goto('/links-page');
  await expect(preview(page).locator('.lp-root')).toHaveAttribute('data-lp-theme', 'light');
  await preview(page).getByRole('radio', { name: 'ليلي' }).click();
  await expect(preview(page).locator('.lp-root')).toHaveAttribute('data-lp-theme', 'dark');
});

test('جدول مش موجود: رسالة واضحة بدل شاشة فاضية', async ({ page }) => {
  await page.route('**/rest/v1/links_page_*', (route) =>
    json(route, { code: '42P01', message: 'relation "public.links_page_blocks" does not exist', details: null, hint: null }, 404));
  await page.goto('/links-page');
  await expect(page.getByRole('alert')).toContainText('تعذّر تحميل الصفحة');
  await expect(page.getByTestId('links-blocks')).toHaveCount(0);
});
