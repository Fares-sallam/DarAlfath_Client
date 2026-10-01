import { test, expect } from '@playwright/test';

// The cover is a book's main image. The public catalog's own main_image_url
// prefers a gallery photo over it, so the storefront must not trust that
// column. The catalog response is rewritten in flight (nothing is written
// anywhere) to make the two disagree.

const GALLERY_PHOTO = 'https://example.test/gallery-photo.jpg';

test('الغلاف هو الصورة الأساسية في الكارت وفي صفحة الكتاب، حتى لو المعرض فيه صور', async ({ page }) => {
  let cover = '';
  let productId = '';

  await page.route('**/rest/v1/products_public_catalog*', async (route) => {
    const response = await route.fetch();
    const rows = (await response.json()) as { product_id: string; cover_url: string | null; main_image_url: string | null; images: unknown }[];
    const book = rows.find((r) => r.cover_url);
    if (book) {
      cover = book.cover_url!;
      productId = book.product_id;
    }
    // A gallery photo is reported as the main image, ahead of the cover.
    const changed = rows.map((r) => (r.product_id === productId && r.cover_url
      ? { ...r, main_image_url: GALLERY_PHOTO, images: [GALLERY_PHOTO, r.cover_url] }
      : r));
    return route.fulfill({ response, json: changed });
  });
  await page.route('**/rest/v1/product_images*', async (route) => {
    // The book page asks for the gallery rows: the photo comes first there too.
    if (!productId || !route.request().url().includes(productId)) return route.fallback();
    return route.fulfill({ json: [{ url: GALLERY_PHOTO, is_primary: true, sort_order: 0 }, { url: cover, is_primary: false, sort_order: 1 }] });
  });

  await page.goto('/books');
  await expect(page.locator('.book-card__cover img').first()).toBeVisible({ timeout: 15_000 });
  test.skip(!cover, 'مفيش كتاب له غلاف');

  const card = page.locator('.book-card__cover', { has: page.locator(`img[src="${cover}"]`) }).first();
  await expect(card).toBeVisible();
  await expect(page.locator(`img[src="${GALLERY_PHOTO}"]`)).toHaveCount(0);

  await page.goto(`/book/${productId}`);
  const main = page.locator('.bk3-book__cover img');
  await expect(main).toHaveAttribute('src', cover, { timeout: 15_000 });
  // Both photos are in the gallery, the cover first and shown once.
  await expect(page.locator('.bk3-thumb')).toHaveCount(2);
  await expect(page.locator('.bk3-thumb').first()).toHaveAttribute('aria-current', 'true');
});
