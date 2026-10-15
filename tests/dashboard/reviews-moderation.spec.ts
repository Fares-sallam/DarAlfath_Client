import { test, expect, type Route } from '../fixtures';

// "تقييمات العملاء": comments wait for approval; the page opens on them, the menu shows how many wait, and
// "إظهار" / "إخفاء" set the status. The comments are answered in flight; writes are recorded, not sent.

const rows = [
  { id: 'r1', product_id: 'p', user_id: null, reviewer_name: 'زائرة', rating: 5, comment: 'جميل', status: 'pending', is_verified_buyer: false, is_hidden: true, created_at: '2026-10-14T10:00:00Z', updated_at: '2026-10-14T10:00:00Z', products: { title: 'كتاب أ' } },
  { id: 'r2', product_id: 'p', user_id: 'u', reviewer_name: 'مشتري', rating: 4, comment: 'مفيد', status: 'pending', is_verified_buyer: true, is_hidden: true, created_at: '2026-10-13T10:00:00Z', updated_at: '2026-10-13T10:00:00Z', products: { title: 'كتاب ب' } },
  { id: 'r3', product_id: 'p', user_id: null, reviewer_name: 'قديم', rating: 3, comment: 'عادي', status: 'approved', is_verified_buyer: false, is_hidden: false, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', products: { title: 'كتاب ج' } },
];

test('تقييمات العملاء: بتفتح على المستني، والعدد جنب القايمة، و«إظهار» و«إخفاء» بيغيروا الحالة', async ({ page }) => {
  const writes: { method: string; url: string; body: unknown }[] = [];
  await page.route('**/rest/v1/**', (route: Route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.fallback();
    writes.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/rest/v1/product_reviews*', (route: Route) => {
    const req = route.request();
    if (req.method() === 'HEAD') {
      return route.fulfill({ status: 200, headers: { 'content-range': '0-0/2', 'access-control-expose-headers': 'content-range' }, body: '' });
    }
    if (req.method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });

  await page.goto('/reviews');
  await expect(page.getByTestId('pending-reviews-badge')).toHaveText('2');
  await expect(page.getByTestId('reviews-pending-count')).toHaveText('2');
  await expect(page.getByRole('button', { name: /بانتظار المراجعة/ })).toHaveAttribute('aria-pressed', 'true');
  const list = page.getByTestId('review-row');
  await expect(list).toHaveCount(2);
  await expect(list.nth(0)).toContainText('زائر');
  await expect(list.nth(1)).toContainText('مشتري موثّق');

  await page.getByRole('button', { name: 'إظهار تعليق زائرة' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].url).toContain('id=eq.r1');
  expect(writes[0].body).toEqual({ status: 'approved' });

  await page.getByRole('button', { name: 'إخفاء تعليق مشتري' }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].url).toContain('id=eq.r2');
  expect(writes[1].body).toEqual({ status: 'hidden' });

  await page.getByRole('button', { name: 'ظاهرة', exact: true }).click();
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText('قديم');
  await expect(page.getByRole('button', { name: 'إظهار تعليق قديم' })).toHaveCount(0);
});
