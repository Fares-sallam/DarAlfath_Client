import { test, expect, type Page, type Route } from '../fixtures';
import { signInAsFakeOwner } from '../support/fakeOwner';

// «المؤلفون والناشرون» on the books page: the lists the book form chooses from, with how many books each name has; a name
// changed for all its books, two names merged, an unused name removed, and the names found on books that are not listed.
// Hermetic: no real sign-in, the RPCs are answered here and every call is recorded.

test.use({ storageState: { cookies: [], origins: [] } });

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

interface Row { id: string | null; name: string; books: number; listed: boolean }
interface Call { name: string; body: any }

async function setUp(page: Page, authors: Row[], publishers: Row[] = []) {
  const calls: Call[] = [];
  const posts: { table: string; body: any }[] = [];
  const lists: Record<string, Row[]> = { author: authors, publisher: publishers };
  await signInAsFakeOwner(page);
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const rpc = /\/rest\/v1\/rpc\/(name_list_[a-z]+)/.exec(url);
    if (rpc) {
      const body = req.postDataJSON();
      if (rpc[1] === 'name_list_usage') return json(route, lists[body.p_kind]);
      calls.push({ name: rpc[1], body });
      return json(route, rpc[1] === 'name_list_delete' ? null : 3);
    }
    const table = /\/rest\/v1\/(authors|publishers)/.exec(url)?.[1];
    if (table) {
      if (req.method() === 'GET' || req.method() === 'HEAD') return json(route, (table === 'authors' ? authors : publishers).filter((r) => r.listed).map((r) => ({ name: r.name })));
      posts.push({ table, body: req.postDataJSON() });
      return route.fulfill({ status: 201, body: '' });
    }
    return route.fallback();
  });
  await page.goto('/books');
  await page.getByTestId('open-names-manager').click();
  await expect(page.getByTestId('names-manager')).toBeVisible({ timeout: 20_000 });
  return { calls, posts };
}

const AUTHORS: Row[] = [
  { id: 'a1', name: 'محمد القليعي', books: 17, listed: true },
  { id: 'a2', name: 'عبدالرحمن بكر', books: 9, listed: true },
  { id: 'a3', name: 'مؤلف من غير كتب', books: 0, listed: true },
  { id: null, name: 'مؤلف مكتوب بس', books: 2, listed: false },
];
const rows = (page: Page) => page.getByTestId('names-row');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });

test('القايمة: كل اسم بعدد كتبه، والأسماء المكتوبة على كتب ومش في القايمة في الأول بلون مميّز (محتاجة قرار)', async ({ page }) => {
  await setUp(page, AUTHORS);
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).first()).toHaveAttribute('data-listed', 'false');
  await expect(rows(page).first()).toContainText('مكتوب على كتب ومش في القايمة');
  await expect(row(page, 'محمد القليعي').getByTestId('names-books')).toHaveText('17 كتاب');
  // an unused name can be removed, a used one cannot
  await expect(row(page, 'مؤلف من غير كتب').getByRole('button', { name: /^حذف/ })).toBeEnabled();
  await expect(row(page, 'محمد القليعي').getByRole('button', { name: /^حذف/ })).toBeDisabled();
});

test('تغيير اسم: بيسأل عن عدد الكتب، وبيبعت الاسم الجديد منضّف', async ({ page }) => {
  const { calls } = await setUp(page, AUTHORS);
  page.once('dialog', (d) => { expect(d.message()).toContain('17 كتاب'); void d.accept(); });
  await row(page, 'محمد القليعي').getByRole('button', { name: 'تغيير اسم محمد القليعي' }).click();
  await page.getByTestId('names-rename-input').fill('  محمد   القليعي الأزهري ');
  await page.getByTestId('names-rename-save').click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ name: 'name_list_rename', body: { p_kind: 'author', p_id: 'a1', p_name: 'محمد القليعي الأزهري' } });
});

test('تغيير اسم من غير كتب: من غير سؤال. والإلغاء مبيبعتش حاجة', async ({ page }) => {
  const { calls } = await setUp(page, AUTHORS);
  await row(page, 'مؤلف من غير كتب').getByRole('button', { name: /^تغيير اسم/ }).click();
  await page.getByTestId('names-rename-input').fill('مؤلف اتغيّر');
  await page.getByTestId('names-rename-save').click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].body).toMatchObject({ p_id: 'a3', p_name: 'مؤلف اتغيّر' });
  await row(page, 'عبدالرحمن بكر').getByRole('button', { name: /^تغيير اسم/ }).click();
  await page.getByRole('button', { name: 'إلغاء' }).click();
  expect(calls).toHaveLength(1);
});

test('دمج: بيختار الاسم اللي هيتدمج فيه، وبيأكد، وبيبعت الاتنين', async ({ page }) => {
  const { calls } = await setUp(page, AUTHORS);
  await row(page, 'عبدالرحمن بكر').getByRole('button', { name: /^دمج/ }).click();
  const merge = page.getByTestId('names-merge');
  await expect(merge.getByTestId('names-merge-go')).toBeDisabled();
  // the name itself is not offered, nor an unlisted one
  await expect(merge.getByTestId('names-merge-into').locator('option')).toHaveText(['— اختار —', 'مؤلف من غير كتب', 'محمد القليعي']);
  await merge.getByTestId('names-merge-into').selectOption({ label: 'محمد القليعي' });
  page.once('dialog', (d) => { expect(d.message()).toContain('9 كتاب'); void d.accept(); });
  await merge.getByTestId('names-merge-go').click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ name: 'name_list_merge', body: { p_kind: 'author', p_from: 'a2', p_into: 'a1' } });
});

test('حذف اسم مش مستخدم: بيأكد وبيبعت', async ({ page }) => {
  const { calls } = await setUp(page, AUTHORS);
  page.once('dialog', (d) => void d.accept());
  await row(page, 'مؤلف من غير كتب').getByRole('button', { name: /^حذف/ }).click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ name: 'name_list_delete', body: { p_kind: 'author', p_id: 'a3' } });
});

test('اسم مكتوب على كتب ومش في القايمة: زر «إضافة للقايمة» بيضيفه بنفس الاسم', async ({ page }) => {
  const { posts } = await setUp(page, AUTHORS);
  await row(page, 'مؤلف مكتوب بس').getByTestId('names-list-it').click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ table: 'authors', body: { name: 'مؤلف مكتوب بس' } });
});

test('الناشرون: تبويب لوحده، فاضي لحد ما تضيف، والإضافة بتروح لجدول الناشرين', async ({ page }) => {
  const { posts } = await setUp(page, AUTHORS, []);
  await page.getByTestId('names-tab-publisher').click();
  await expect(page.getByTestId('names-empty')).toContainText('مفيش ناشرين');
  await page.getByTestId('names-new').fill('  دار  النور ');
  await page.getByTestId('names-add').click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ table: 'publishers', body: { name: 'دار النور' } });
});

test('البحث بيفلتر الأسماء', async ({ page }) => {
  await setUp(page, AUTHORS);
  await page.getByTestId('names-search').fill('بكر');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('عبدالرحمن بكر');
  await page.getByTestId('names-search').fill('مفيش زي كده');
  await expect(page.getByTestId('names-empty')).toHaveText('مفيش نتيجة.');
});
