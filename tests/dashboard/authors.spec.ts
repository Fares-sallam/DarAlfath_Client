import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// The book form's author: chosen from one list of names (so an author is never spelled two ways, nor with and without a
// title); a name that is not there yet is added with the «إضافة مؤلف» button. Hermetic: no real sign-in, the list is
// answered here and writes are only recorded.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function setUp(page: Page, listed: string[] = ['محمد القليعي', 'د / أيمن أمين عبدالغني']) {
  const added: { name: string }[] = [];
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/authors*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') return json(route, listed.map((name) => ({ name })));
    const body = req.postDataJSON() as { name: string };
    added.push(body);
    listed.push(body.name);
    return json(route, { name: body.name }, 201);
  });
  await page.goto('/books');
  await page.getByRole('button', { name: 'إضافة كتاب جديد' }).first().click();
  await expect(page.getByTestId('author-field')).toBeVisible({ timeout: 20_000 });
  return { added, select: page.getByTestId('author-select') };
}

test('المؤلف: قايمة منسدلة بالأسماء المتاحة بترتيب أبجدي، ومطلوب، وزر «إضافة مؤلف» جنبها', async ({ page }) => {
  const { select } = await setUp(page);
  await expect(select.locator('option')).toHaveText(['— اختار مؤلف —', 'د / أيمن أمين عبدالغني', 'محمد القليعي']);
  await expect(page.getByTestId('author-field').locator('label').first()).toContainText('المؤلف');
  await expect(page.getByTestId('author-add-button')).toHaveText('إضافة مؤلف');
  await select.selectOption('محمد القليعي');
  await expect(select).toHaveValue('محمد القليعي');
  await expect(page.getByTestId('author-add')).toHaveCount(0);
});

test('إضافة مؤلف جديد: بيتحفظ بالاسم منضّف، ويتختار، وخانة الكتابة بتتقفل', async ({ page }) => {
  const { added, select } = await setUp(page);
  await page.getByTestId('author-add-button').click();
  await page.getByTestId('author-new-name').fill('  عبدالرحمن   بكر ');
  await page.getByTestId('author-add-save').click();
  await expect.poll(() => added.length).toBe(1);
  expect(added[0]).toEqual({ name: 'عبدالرحمن بكر' });
  await expect(select).toHaveValue('عبدالرحمن بكر');
  await expect(page.getByTestId('author-add')).toHaveCount(0);
});

test('نفس المؤلف بشكل تاني (حرف مختلف أو من غير اللقب): مبيتضافش، وبيتختار الموجود', async ({ page }) => {
  const { added, select } = await setUp(page);
  await page.getByTestId('author-add-button').click();
  await page.getByTestId('author-new-name').fill('أيمن أمين عبدالغنى');
  await page.getByTestId('author-add-save').click();
  await expect(select).toHaveValue('د / أيمن أمين عبدالغني');
  await expect(page.getByTestId('author-note')).toContainText('موجود في القايمة');
  expect(added).toHaveLength(0);
});

test('إضافة من غير اسم: رسالة، ومفيش حاجة بتتبعت. والإلغاء بيقفل الخانة', async ({ page }) => {
  const { added, select } = await setUp(page);
  await page.getByTestId('author-add-button').click();
  await page.getByTestId('author-add-save').click();
  await expect(page.getByTestId('author-note')).toHaveText('اكتب اسم المؤلف الأول.');
  await page.getByTestId('author-add').getByRole('button', { name: 'إلغاء' }).click();
  await expect(page.getByTestId('author-add')).toHaveCount(0);
  await expect(select).toHaveValue('');
  expect(added).toHaveLength(0);
});

test('المؤلف والناشر قايمتين منفصلتين في نفس النموذج', async ({ page }) => {
  await setUp(page);
  await expect(page.getByTestId('publisher-field')).toBeVisible();
  await expect(page.getByTestId('author-select')).toBeVisible();
  await expect(page.getByTestId('publisher-select')).toBeVisible();
});
