import { test, expect, type Page } from '@playwright/test';

// Photos are resized and re-encoded in the browser before they go to storage.
// No sign-in and no database: the app's own upload functions are called on the
// public /login page and every storage request is answered with a fake success,
// so only what *would* have been uploaded is looked at.

test.use({ storageState: { cookies: [], origins: [] } });

interface Upload { url: string; type: string; bytes: Buffer }

/** The file part of a multipart upload body. */
function filePart(body: Buffer, contentType: string): { type: string; data: Buffer } {
  const boundary = `--${/boundary=(.+)$/.exec(contentType)![1]}`;
  let start = 0;
  while (start < body.length) {
    const next = body.indexOf(boundary, start);
    if (next < 0) break;
    const headerEnd = body.indexOf('\r\n\r\n', next);
    const headers = body.subarray(next, headerEnd).toString('latin1');
    const type = /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1];
    if (type && type.startsWith('image/')) {
      const dataStart = headerEnd + 4;
      const dataEnd = body.indexOf(`\r\n${boundary}`, dataStart);
      return { type, data: body.subarray(dataStart, dataEnd) };
    }
    start = next + boundary.length;
  }
  throw new Error('no image part in the upload');
}

/** Width and height from a WebP file's header (lossy, lossless or extended). */
function webpSize(data: Buffer): { width: number; height: number } {
  expect(data.subarray(0, 4).toString()).toBe('RIFF');
  expect(data.subarray(8, 12).toString()).toBe('WEBP');
  const chunk = data.subarray(12, 16).toString();
  if (chunk === 'VP8X') return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  const bits = data.readUInt32LE(21); // VP8L
  return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
}

async function setUp(page: Page) {
  const uploads: Upload[] = [];
  await page.route('**/storage/v1/object/**', (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fallback();
    const { type, data } = filePart(request.postDataBuffer()!, request.headers()['content-type']);
    uploads.push({ url: decodeURIComponent(request.url()), type, bytes: data });
    return route.fulfill({ json: { Key: 'fake', Id: 'fake' } });
  });
  await page.goto('/login');
  return uploads;
}

/** A busy picture (gradient + many coloured shapes), so it is a realistic size rather than a flat fill. */
const makeImage = (page: Page, width: number, height: number, type: string, quality = 0.92) =>
  page.evaluateHandle(async ([w, h, t, q]) => {
    const canvas = document.createElement('canvas');
    canvas.width = w as number; canvas.height = h as number;
    const g = canvas.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, w as number, h as number);
    grad.addColorStop(0, '#2b6cb0'); grad.addColorStop(1, '#f6ad55');
    g.fillStyle = grad; g.fillRect(0, 0, w as number, h as number);
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `hsla(${Math.floor(rand() * 360)}, 70%, 55%, 0.55)`;
      g.beginPath();
      g.arc(rand() * (w as number), rand() * (h as number), 6 + rand() * 70, 0, Math.PI * 2);
      g.fill();
    }
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), t as string, q as number));
    const ext = t === 'image/png' ? 'png' : t === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `photo.${ext}`, { type: t as string });
  }, [width, height, type, quality] as const);

test('صورة معرض كبيرة: بتترفع WebP بأكبر ضلع 1600 والنسبة محفوظة وحجمها أقل بكتير', async ({ page }) => {
  const uploads = await setUp(page);
  const file = await makeImage(page, 3000, 2000, 'image/jpeg');
  const original = await file.evaluate((f) => (f as File).size);
  expect(original).toBeGreaterThan(300 * 1024);

  const url = await page.evaluate(async (f) => (await import('/src/hooks/useBooks.ts')).uploadProductImage(f as File, 'prod-1', '-0'), file);

  expect(uploads).toHaveLength(1);
  const [upload] = uploads;
  expect(upload.url).toContain('/product-images/prod-1/');
  expect(upload.url).toMatch(/-0\.webp(\?|$)/);
  expect(url).toMatch(/\.webp$/);
  expect(upload.type).toBe('image/webp');
  expect(webpSize(upload.bytes)).toEqual({ width: 1600, height: 1067 });
  expect(upload.bytes.length).toBeLessThan(original * 0.6);
});

test('غلاف: بيتحفظ WebP، والطولي بيحافظ على نسبته', async ({ page }) => {
  const uploads = await setUp(page);
  const file = await makeImage(page, 3000, 4000, 'image/png');

  const url = await page.evaluate(async (f) => (await import('/src/hooks/useBooks.ts')).uploadCoverImage(f as File, 'temp-123'), file);

  const [upload] = uploads;
  expect(upload.url).toContain('/book-covers/covers/temp-123.webp');
  expect(url).toMatch(/covers\/temp-123\.webp$/);
  expect(upload.type).toBe('image/webp');
  expect(webpSize(upload.bytes)).toEqual({ width: 1200, height: 1600 });
});

test('صورة صغيرة أصلًا: بتترفع زي ما هي من غير ما تتعدّل', async ({ page }) => {
  const uploads = await setUp(page);
  const file = await makeImage(page, 400, 300, 'image/png');
  const size = await file.evaluate((f) => (f as File).size);
  expect(size).toBeLessThan(250 * 1024);

  await page.evaluate(async (f) => (await import('/src/hooks/useBooks.ts')).uploadProductImage(f as File, 'prod-2'), file);

  const [upload] = uploads;
  expect(upload.type).toBe('image/png');
  expect(upload.bytes.length).toBe(size);
  expect(upload.url).toMatch(/\.png(\?|$)/);
});

test('جودة الصورة بعد الضغط قريبة جدًا من الأصل (PSNR) على حجم العرض', async ({ page }) => {
  await setUp(page);
  const file = await makeImage(page, 2048, 2048, 'image/jpeg');

  const psnr = await page.evaluate(async (f) => {
    const { compressImage } = await import('/src/lib/imageCompression.ts');
    const original = f as File;
    const compressed = await compressImage(original);
    const toData = async (blob: Blob, size: number) => {
      const bitmap = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const x = c.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(bitmap, 0, 0, size, size);
      return x.getImageData(0, 0, size, size).data;
    };
    // What a retina screen shows a 340px picture with: 680 device pixels.
    const [a, b] = await Promise.all([toData(original, 680), toData(compressed, 680)]);
    let se = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) { const d = a[i + k] - b[i + k]; se += d * d; n++; }
    return { db: 10 * Math.log10((255 * 255) / (se / n)), saved: 1 - compressed.size / original.size, type: compressed.type };
  }, file);

  expect(psnr.type).toBe('image/webp');
  expect(psnr.db).toBeGreaterThan(38);   // above ~40 dB the eye can't tell them apart
  expect(psnr.saved).toBeGreaterThan(0.4);
});

test('صيغة مش بتتضغط (GIF) بتتسلّم زي ما هي', async ({ page }) => {
  await setUp(page);
  const same = await page.evaluate(async () => {
    const { compressImage } = await import('/src/lib/imageCompression.ts');
    const gif = new File([new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0])], 'a.gif', { type: 'image/gif' });
    return (await compressImage(gif)) === gif;
  });
  expect(same).toBe(true);
});

test('ملف تالف مش بيوقّف الرفع: بيتبعت الأصلي', async ({ page }) => {
  await setUp(page);
  const same = await page.evaluate(async () => {
    const { compressImage } = await import('/src/lib/imageCompression.ts');
    const broken = new File([new Uint8Array(400_000).fill(7)], 'broken.jpg', { type: 'image/jpeg' });
    return (await compressImage(broken)) === broken;
  });
  expect(same).toBe(true);
});
