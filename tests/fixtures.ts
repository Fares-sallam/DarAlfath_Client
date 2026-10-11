import { test as base } from '@playwright/test';
import { deflateSync } from 'node:zlib';

export * from '@playwright/test';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** A small flat-grey portrait PNG (book-cover proportions), a few hundred bytes. */
function stubPicture(width = 200, height = 300) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(0, 9); // greyscale
  const rows = Buffer.alloc((width + 1) * height, 0xd8); // filter byte 0 + grey pixels
  for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const STUB = stubPicture();

/**
 * Every test hits the real Supabase project, and book covers, gallery photos and banners are large
 * files served from Storage (they count towards the project's egress). Layout and behaviour don't
 * depend on the actual pictures, so reads from the public image buckets are answered with a tiny
 * stand-in of the same shape. Writes are untouched (tests that upload fake them on their own).
 */
export const test = base.extend<{ stubStorageImages: void }>({
  stubStorageImages: [
    async ({ context }, use) => {
      await context.route(/\/storage\/v1\/(object\/public|render\/image)\//, (route) => {
        const method = route.request().method();
        if (method !== 'GET' && method !== 'HEAD') return route.fallback();
        return route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: STUB,
          headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=3600' },
        });
      });
      await use();
    },
    { auto: true },
  ],
});
