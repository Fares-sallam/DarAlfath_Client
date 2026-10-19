import { test, expect, type Locator, type Page } from '../fixtures';

// A book card's picture moves inside its frame on hover: it grows a little and slides the other way from
// the pointer, while the frame stays where it is (it clips the picture). Real mouse; nothing is written.

const CARD = 'article.book-card:has(.book-card__cover > img.book-cover__img)';

/** The picture's scale and sideways/up-down slide, read from what the browser computed. */
const motion = (img: Locator) => img.evaluate((el) => {
  const m = new DOMMatrix(getComputedStyle(el).transform);
  return { scale: m.a, x: m.e, y: m.f };
});

async function firstCard(page: Page) {
  await page.goto('/books');
  const card = page.locator(CARD).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900); // the card's own entrance settles
  return card;
}

test('كارت الكتاب: الصورة بتكبر وتتحرك جوه الإطار مع الماوس، وبترجع لمكانها لما الماوس يمشي', async ({ page }) => {
  const card = await firstCard(page);
  const cover = card.locator('.book-card__cover');
  const img = cover.locator('> img.book-cover__img');
  const frame = (await cover.boundingBox())!;

  expect(await motion(img)).toMatchObject({ scale: 1, x: 0, y: 0 });

  // Pointer on the left side of the frame: the picture grows and slides to the right (away from it).
  await page.mouse.move(frame.x + frame.width * 0.15, frame.y + frame.height * 0.5, { steps: 6 });
  await page.waitForTimeout(800);
  const left = await motion(img);
  expect(left.scale).toBeGreaterThan(1.05);
  expect(left.scale).toBeLessThan(1.1);
  expect(left.x).toBeGreaterThan(2);

  // Pointer on the right side: it slides the other way.
  await page.mouse.move(frame.x + frame.width * 0.85, frame.y + frame.height * 0.5, { steps: 6 });
  await page.waitForTimeout(800);
  expect((await motion(img)).x).toBeLessThan(-2);

  // Top and bottom move it up and down too, by less.
  await page.mouse.move(frame.x + frame.width * 0.5, frame.y + frame.height * 0.1, { steps: 6 });
  await page.waitForTimeout(800);
  expect((await motion(img)).y).toBeGreaterThan(1);

  // The frame clips it: it never spills out of the card.
  expect(await cover.evaluate((el) => getComputedStyle(el).overflow)).toBe('hidden');

  // Pointer away: back to rest.
  await page.mouse.move(5, 5, { steps: 6 });
  await page.waitForTimeout(900);
  expect(await motion(img)).toMatchObject({ scale: 1, x: 0, y: 0 });
});

test('كارت الكتاب: لو الحركة مقفولة في الجهاز (reduced motion) الصورة بتفضل ثابتة', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const card = await firstCard(page);
  const cover = card.locator('.book-card__cover');
  const img = cover.locator('> img.book-cover__img');
  const frame = (await cover.boundingBox())!;

  await page.mouse.move(frame.x + frame.width * 0.2, frame.y + frame.height * 0.5, { steps: 6 });
  await page.waitForTimeout(800);
  expect(await motion(img)).toMatchObject({ scale: 1, x: 0, y: 0 });
});
