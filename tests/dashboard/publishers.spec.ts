import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// The book form's publisher: chosen from one list of names (so a house is never spelled two ways); a name that is not
// there yet is added from the form. Hermetic: no real sign-in, the list is answered here and writes are only recorded.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function setUp(page: Page, listed: string[] = ['دار النور', 'دار الفتح']) {
  const added: { name: string }[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/publishers*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') return json(route, listed.map((name) => ({ name })));
    const body = req.postDataJSON() as { name: string };
    added.push(body);
    listed.push(body.name);
    return json(route, { name: body.name }, 201);
  });
  await page.goto('/books');
  await page.getByRole('button', { name: 'إضافة كتاب جديد' }).first().click();
  await expect(page.getByTestId('publisher-field')).toBeVisible({ timeout: 20_000 });
  return { added, select: page.getByTestId('publisher-select') };
}

test('الناشر: قايمة منسدلة بالأسماء المتاحة بترتيب أبجدي، ومن غير ناشر هو الأساسي، وزر إضافة ظاهر', async ({ page }) => {
  const { select } = await setUp(page);
  await expect(select.locator('option')).toHaveText(['— من غير ناشر —', 'دار الفتح', 'دار النور']);
  await expect(page.getByTestId('publisher-add-button')).toHaveText('إضافة ناشر');
  await expect(select).toHaveValue('');
  await select.selectOption('دار الفتح');
  await expect(select).toHaveValue('دار الفتح');
  await expect(page.getByTestId('publisher-add')).toHaveCount(0);
});

test('إضافة ناشر جديد: بيتحفظ بالاسم منضّف، ويتختار، وخانة الكتابة بتتقفل', async ({ page }) => {
  const { added, select } = await setUp(page);
  await page.getByTestId('publisher-add-button').click();
  await page.getByTestId('publisher-new-name').fill('  مكتبة   الهدى ');
  await page.getByTestId('publisher-add-save').click();
  await expect.poll(() => added.length).toBe(1);
  expect(added[0]).toEqual({ name: 'مكتبة الهدى' });
  await expect(select).toHaveValue('مكتبة الهدى');
  await expect(page.getByTestId('publisher-add')).toHaveCount(0);
});

test('اسم مكتوب بشكل تاني لناشر موجود: مبيتضافش، وبيتختار الموجود', async ({ page }) => {
  const { added, select } = await setUp(page);
  await page.getByTestId('publisher-add-button').click();
  await page.getByTestId('publisher-new-name').fill('دَار  الفتـح');
  await page.getByTestId('publisher-add-save').click();
  await expect(select).toHaveValue('دار الفتح');
  await expect(page.getByTestId('publisher-note')).toContainText('«دار الفتح» موجود في القايمة');
  expect(added).toHaveLength(0);
});

test('إضافة من غير اسم: رسالة، ومفيش حاجة بتتبعت. والإلغاء بيرجّع للاختيار', async ({ page }) => {
  const { added, select } = await setUp(page);
  await page.getByTestId('publisher-add-button').click();
  await page.getByTestId('publisher-add-save').click();
  await expect(page.getByTestId('publisher-note')).toHaveText('اكتب اسم الناشر الأول.');
  await page.getByTestId('publisher-add').getByRole('button', { name: 'إلغاء' }).click();
  await expect(page.getByTestId('publisher-add')).toHaveCount(0);
  await expect(select).toHaveValue('');
  expect(added).toHaveLength(0);
});

test('قايمة فاضية: «من غير ناشر» بس، وزر الإضافة هو الطريق', async ({ page }) => {
  const { select } = await setUp(page, []);
  await expect(select.locator('option')).toHaveText(['— من غير ناشر —']);
  await expect(page.getByTestId('publisher-add-button')).toBeVisible();
});
