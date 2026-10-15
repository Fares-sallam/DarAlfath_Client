import { test, expect, type Page, type Route } from '../fixtures';
import { signIn } from './helpers';

// The book page's "التعليقات" tab: approved comments (with "مشتري موثّق"), the form anyone can use, and a
// signed-in customer's own comment while it waits. The comments and the submit-review function are
// answered in flight: nothing is written anywhere.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

const review = (over: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  product_id: 'x',
  user_id: null,
  reviewer_name: 'قارئ',
  rating: 5,
  comment: 'كتاب ممتاز',
  status: 'approved',
  is_verified_buyer: false,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  ...over,
});

/** Opens a real book's page with the given comments, and records what the form sends. */
async function openBook(page: Page, rows: (productId: string) => Record<string, unknown>[], answer?: (route: Route) => Promise<void>) {
  const sent: Record<string, unknown>[] = [];
  let productId = '';
  await page.route('**/rest/v1/product_reviews*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = new URL(route.request().url()).searchParams.get('product_id')?.replace(/^eq\./, '') ?? '';
    return json(route, rows(id).map((r) => ({ ...r, product_id: id })));
  });
  await page.route('**/functions/v1/submit-review', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    sent.push(route.request().postDataJSON());
    return answer ? answer(route) : json(route, { ok: true, status: 'pending' });
  });
  await page.goto('/books');
  const first = page.getByRole('button', { name: /^فتح صفحة/ }).first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  await first.click();
  await page.waitForURL(/\/book\//);
  productId = page.url().split('/book/')[1];
  await page.getByRole('button', { name: /^التعليقات/ }).click();
  return { sent, productId: () => productId };
}

test('التعليقات: تبويب جنب المواصفات، والتعليقات الموافَق عليها بس بتظهر، بالاسم والتقييم و«مشتري موثّق»', async ({ page }) => {
  await openBook(page, () => [
    review({ reviewer_name: 'أم يوسف', rating: 5, comment: 'ابني حبه جدًا', is_verified_buyer: true }),
    review({ reviewer_name: 'زائر', rating: 3, comment: 'كويس' }),
    review({ reviewer_name: 'مستني', rating: 1, comment: 'لسه مستني الموافقة', status: 'pending' }),
  ]);
  const tabs = await page.locator('.bk3-tab-nav .bk3-tab').allTextContents();
  expect(tabs.map((t) => t.replace(/\s*\(.*\)$/, '').trim())).toEqual([expect.stringMatching(/^نبذة/), 'المواصفات', 'التعليقات']);

  const list = page.getByTestId('reviews-list');
  await expect(list.locator('li')).toHaveCount(2);
  await expect(list).toContainText('أم يوسف');
  await expect(list).toContainText('ابني حبه جدًا');
  await expect(list.locator('li').first().getByText('مشتري موثّق')).toBeVisible();
  await expect(list.locator('li').nth(1).getByText('مشتري موثّق')).toHaveCount(0);
  await expect(list).not.toContainText('لسه مستني الموافقة');
});

test('زائر من غير حساب: الاسم والتقييم والتعليق مطلوبين، والإرسال بيقول إنه هيظهر بعد المراجعة', async ({ page }) => {
  const { sent, productId } = await openBook(page, () => []);
  await expect(page.getByText('لا توجد تعليقات بعد')).toBeVisible();
  const form = page.getByRole('form', { name: 'اكتب تعليقك' });
  await expect(form).toBeVisible();

  await form.getByRole('button', { name: 'إرسال التعليق' }).click();
  await expect(form.getByRole('alert')).toHaveText('اكتب اسمك.');
  await form.getByLabel('الاسم').fill('محمد علي');
  await form.getByRole('button', { name: 'إرسال التعليق' }).click();
  await expect(form.getByRole('alert')).toHaveText('اختر تقييمك بالنجوم.');
  await form.getByRole('radio', { name: '4 من 5' }).click();
  await form.getByRole('button', { name: 'إرسال التعليق' }).click();
  await expect(form.getByRole('alert')).toHaveText('اكتب تعليقك.');
  expect(sent).toHaveLength(0);

  await form.getByLabel('التعليق').fill('شرح واضح ومناسب للأطفال');
  await form.getByRole('button', { name: 'إرسال التعليق' }).click();
  await expect(page.getByTestId('review-sent')).toContainText('سيظهر في صفحة الكتاب بعد مراجعة الإدارة');
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ product_id: productId(), reviewer_name: 'محمد علي', rating: 4, comment: 'شرح واضح ومناسب للأطفال', website: '' });
  // Nothing appears on the page yet.
  await expect(page.getByTestId('reviews-list')).toHaveCount(0);

  // The hidden field is off screen and out of the tab order.
  await page.getByRole('button', { name: 'اكتب تعليقًا آخر' }).click();
  const trap = page.locator('input[name="website"]');
  await expect(trap).toHaveAttribute('tabindex', '-1');
  const box = await trap.boundingBox();
  expect(box === null || box.x + box.width < 0 || box.x > 5000).toBe(true);
});

test('لو السيرفر رفض (كتير في وقت قصير)، رسالته بتظهر والتعليق مش بيتعد اتبعت', async ({ page }) => {
  await openBook(page, () => [], (route) => json(route, { error: 'أرسلت تعليقات كثيرة في وقت قصير. حاول مرة أخرى بعد قليل.' }, 429));
  const form = page.getByRole('form', { name: 'اكتب تعليقك' });
  await form.getByLabel('الاسم').fill('سارة');
  await form.getByRole('radio', { name: '5 من 5' }).click();
  await form.getByLabel('التعليق').fill('رائع');
  await form.getByRole('button', { name: 'إرسال التعليق' }).click();
  await expect(form.getByRole('alert')).toHaveText('أرسلت تعليقات كثيرة في وقت قصير. حاول مرة أخرى بعد قليل.');
  await expect(page.getByTestId('review-sent')).toHaveCount(0);
});

test('عميل مسجّل: تعليقه المستني بيظهر له لوحده بحالة «قيد المراجعة»، والتعديل بيفتح الفورم بقيمه', async ({ page }) => {
  await signIn(page);
  const userId = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.includes('auth-token')) return JSON.parse(localStorage.getItem(key)!)?.user?.id as string;
    }
    return '';
  });
  expect(userId).toBeTruthy();
  const { sent } = await openBook(page, () => [
    review({ user_id: userId, reviewer_name: 'حسابي', rating: 4, comment: 'تعليقي', status: 'pending' }),
    review({ reviewer_name: 'غيري', rating: 5, comment: 'ممتاز' }),
  ]);
  const mine = page.getByTestId('my-review');
  await expect(mine).toContainText('تعليقك');
  await expect(mine).toContainText('قيد المراجعة');
  await expect(page.getByRole('form', { name: 'اكتب تعليقك' })).toHaveCount(0);
  await expect(page.getByTestId('reviews-list').locator('li')).toHaveCount(1);

  await mine.getByRole('button', { name: 'تعديل' }).click();
  const form = page.getByRole('form', { name: 'اكتب تعليقك' });
  await expect(form.getByLabel('الاسم')).toHaveValue('حسابي');
  await expect(form.getByLabel('التعليق')).toHaveValue('تعليقي');
  await expect(form.getByRole('radio', { name: '4 من 5' })).toHaveAttribute('aria-checked', 'true');
  await form.getByLabel('التعليق').fill('تعليقي بعد التعديل');
  await form.getByRole('button', { name: 'إرسال التعديل' }).click();
  await expect(page.getByTestId('review-sent')).toBeVisible();
  expect(sent[0]).toMatchObject({ reviewer_name: 'حسابي', rating: 4, comment: 'تعليقي بعد التعديل' });
});
