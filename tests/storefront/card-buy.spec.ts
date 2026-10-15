import { test, expect, type Page, type Route } from '../fixtures';

// The book card's buttons: "أضف للسلة" turning into a counter for a book sold in one edition, and
// "شراء سريع" (straight to checkout; with several editions, a short list first). Real books are read;
// four of them are given a known situation in flight (one edition in stock, several editions, one
// edition sold out, one digital edition). The cart lives in the browser: nothing is written anywhere.

type Row = Record<string, unknown> & { product_id: string; title: string; variant_count: number };
type VariantRow = Record<string, unknown> & { product_id: string };

const NAMES = {
  one: 'اختبار كارت طبعة متاحة',
  many: 'اختبار كارت أكتر من طبعة',
  out: 'اختبار كارت طبعة خلصت',
  digital: 'اختبار كارت طبعة رقمية',
} as const;
type Kind = keyof typeof NAMES;

/** A rewrite that is still running when the page moves on (to checkout) just lets the request go. */
const tolerant = (handler: (route: Route) => Promise<void>) => async (route: Route) => {
  try {
    await handler(route);
  } catch {
    await route.continue().catch(() => undefined);
  }
};

async function openBooks(page: Page, path = '/books') {
  const chosen = new Map<string, Kind>();
  let ready!: () => void;
  const catalogSeen = new Promise<void>((resolve) => { ready = resolve; });

  await page.route('**/rest/v1/products_public_catalog*', tolerant(async (route: Route) => {
    if (route.request().method() !== 'GET') return void (await route.fallback());
    const response = await route.fetch();
    const rows = (await response.json()) as Row[];
    if (chosen.size === 0) {
      const singles = rows.filter((r) => Number(r.variant_count) === 1 && !r.is_bundle);
      const multi = rows.find((r) => Number(r.variant_count) >= 2 && !r.is_bundle);
      if (singles[0]) chosen.set(singles[0].product_id, 'one');
      if (singles[1]) chosen.set(singles[1].product_id, 'out');
      if (singles[2]) chosen.set(singles[2].product_id, 'digital');
      if (multi) chosen.set(multi.product_id, 'many');
    }
    ready();
    const json = rows.map((r) => (chosen.has(r.product_id) ? { ...r, title: NAMES[chosen.get(r.product_id)!] } : r));
    await route.fulfill({ response, json });
  }));

  await page.route('**/rest/v1/product_variants_public*', tolerant(async (route: Route) => {
    if (route.request().method() !== 'GET') return void (await route.fallback());
    const response = await route.fetch();
    await catalogSeen;
    const rows = (await response.json()) as VariantRow[];
    const json = rows.map((v) => {
      const kind = chosen.get(v.product_id);
      if (kind === 'one') return { ...v, is_digital: false, is_available: true, available_stock: 3 };
      if (kind === 'many') return { ...v, is_available: true, available_stock: v.is_digital ? null : 5 };
      if (kind === 'out') return { ...v, is_digital: false, is_available: false, available_stock: 0 };
      if (kind === 'digital') return { ...v, is_digital: true, variant_type: 'رقمي', is_available: true, available_stock: null };
      return v;
    });
    await route.fulfill({ response, json });
  }));

  await page.goto(path);
  await expect(page.locator('article.book-card').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  test.skip(chosen.size < 4, 'الكتالوج مفيهوش كتب كفاية للاختبار');
}

const card = (page: Page, kind: Kind) => page.getByRole('button', { name: `فتح صفحة ${NAMES[kind]}` });
const cartLines = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('daralfath_client_cart') || '[]') as { title: string; quantity: number; variant_id: string }[]);
const lineFor = async (page: Page, kind: Kind) => (await cartLines(page)).find((l) => l.title === NAMES[kind]);

test('طبعة واحدة: «أضف للسلة» بيتحول لعدّاد، وأقصاه المخزون، والنقص لصفر بيشيله من السلة', async ({ page }) => {
  await openBooks(page);
  const one = card(page, 'one');
  await one.getByRole('button', { name: 'أضف للسلة' }).click();
  await expect(page).toHaveURL(/\/books$/); // the card itself didn't open
  const stepper = one.getByTestId('card-stepper');
  await expect(stepper).toBeVisible();
  await expect(stepper).toContainText('1');
  expect((await lineFor(page, 'one'))?.quantity).toBe(1);

  const plus = stepper.getByRole('button', { name: 'زيادة الكمية' });
  await plus.click();
  await plus.click();
  await expect(stepper).toContainText('3');
  await expect(plus).toBeDisabled(); // three in stock
  expect((await lineFor(page, 'one'))?.quantity).toBe(3);

  const minus = stepper.getByRole('button', { name: 'تقليل الكمية' });
  for (let i = 0; i < 3; i++) await minus.click();
  await expect(one.getByRole('button', { name: 'أضف للسلة' })).toBeVisible();
  expect(await lineFor(page, 'one')).toBeUndefined();
});

test('أكتر من طبعة: «عرض التفاصيل» زي ما هو، و«شراء سريع» بيسأل عن الطبعة وبعدين يفتح الدفع', async ({ page }) => {
  await openBooks(page);
  const many = card(page, 'many');
  await expect(many.getByRole('button', { name: 'عرض التفاصيل' })).toBeVisible();
  await expect(many.getByRole('button', { name: 'أضف للسلة' })).toHaveCount(0);

  await many.getByRole('button', { name: 'شراء سريع' }).click();
  const picker = page.getByRole('dialog', { name: `اختر طبعة ${NAMES.many}` });
  await expect(picker).toBeVisible();
  const editions = picker.locator('button.book-card__edition');
  expect(await editions.count()).toBeGreaterThanOrEqual(2);
  await expect(page).toHaveURL(/\/books$/);

  // Escape closes it; nothing was added.
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  expect(await lineFor(page, 'many')).toBeUndefined();

  await many.getByRole('button', { name: 'شراء سريع' }).click();
  const name = (await editions.first().locator('span').textContent())!.trim();
  await editions.first().click();
  await expect(page).toHaveURL(/\/checkout$/);
  const line = await lineFor(page, 'many');
  expect(line?.quantity).toBe(1);
  expect(JSON.stringify(await cartLines(page))).toContain(name);
});

test('شراء سريع لطبعة واحدة: بيضيف ويفتح الدفع، ولو الكتاب في السلة أصلًا مابيزوّدش نسخة', async ({ page }) => {
  await openBooks(page);
  const one = card(page, 'one');
  await one.getByRole('button', { name: 'أضف للسلة' }).click();
  await one.getByTestId('card-stepper').getByRole('button', { name: 'زيادة الكمية' }).click();
  expect((await lineFor(page, 'one'))?.quantity).toBe(2);

  await one.getByRole('button', { name: 'شراء سريع' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  expect((await lineFor(page, 'one'))?.quantity).toBe(2);
});

test('طبعة خلصت: الزرار مقفول ومكتوب «غير متوفر حاليًا»، ومفيش شراء سريع', async ({ page }) => {
  await openBooks(page);
  const out = card(page, 'out');
  await expect(out.getByRole('button', { name: 'غير متوفر حاليًا' })).toBeDisabled();
  await expect(out.getByRole('button', { name: 'شراء سريع' })).toHaveCount(0);
});

test('طبعة رقمية: بعد الإضافة «في السلة» (الكمية دايمًا واحدة)، والشراء السريع يفتح الدفع', async ({ page }) => {
  await openBooks(page);
  const digital = card(page, 'digital');
  await digital.getByRole('button', { name: 'أضف للسلة' }).click();
  await expect(digital.getByRole('button', { name: 'في السلة' })).toBeVisible();
  await expect(digital.getByTestId('card-stepper')).toHaveCount(0);
  await digital.getByRole('button', { name: 'شراء سريع' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  expect((await lineFor(page, 'digital'))?.quantity).toBe(1);
});

test('الكيبورد: Enter على «أضف للسلة» بيضيف من غير ما يفتح الكتاب', async ({ page }) => {
  await openBooks(page);
  const add = card(page, 'one').getByRole('button', { name: 'أضف للسلة' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(card(page, 'one').getByTestId('card-stepper')).toBeVisible();
  await expect(page).toHaveURL(/\/books$/);
});

test('الموبايل: الأزرار جوه الكارت، وقايمة الطبعات جوه الكارت، ومفيش سكرول جانبي', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openBooks(page);
  const many = card(page, 'many');
  await many.scrollIntoViewIfNeeded();
  await many.getByRole('button', { name: 'شراء سريع' }).click();
  const picker = page.getByRole('dialog', { name: `اختر طبعة ${NAMES.many}` });
  await expect(picker).toBeVisible();
  const [c, p] = await Promise.all([many.boundingBox(), picker.boundingBox()]);
  expect(p!.x).toBeGreaterThanOrEqual(c!.x - 1);
  expect(p!.x + p!.width).toBeLessThanOrEqual(c!.x + c!.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  // A tap outside closes it.
  await page.mouse.click(5, 300);
  await expect(picker).toBeHidden();
});

test('الرئيسية: نفس الأزرار على كروت الشرايط', async ({ page }) => {
  await openBooks(page, '/');
  const anyCard = page.locator('.shelf-rail article.book-card').first();
  await expect(anyCard.locator('.book-card__actions .primary-button').first()).toBeVisible();
});
