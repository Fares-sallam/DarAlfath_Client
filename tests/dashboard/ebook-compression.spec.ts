import fs from 'node:fs';
import { test, expect, type Page } from '../fixtures';

// Ebook files: up to 50 MB go up as they are; a PDF over the limit is shrunk in the browser (Ghostscript in a
// worker) without costing the pages their look; anything else over the limit is refused. A real book's edit
// form is opened and files are handed to its (hidden) file input — nothing is saved: every write is answered
// with a fake success, and the form is never submitted.

const LIMIT = 50 * 1024 * 1024;
const FILE_INPUT = 'input[type="file"][accept=".pdf,.epub,.mobi"]';

test.setTimeout(420_000);

async function fakeWrites(page: Page) {
  await page.route('**/rest/v1/**', (route) =>
    ['GET', 'HEAD'].includes(route.request().method()) ? route.fallback() : route.fulfill({ status: 204 }));
  await page.route('**/storage/v1/object/**', (route) =>
    route.request().method() === 'GET' ? route.fallback() : route.fulfill({ json: { Key: 'fake', Id: 'fake' } }));
  // The preview button opens the picked file in a new tab; keep the blob and don't open anything.
  await page.addInitScript(() => {
    const w = window as unknown as { __blobs: Blob[] };
    w.__blobs = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      if (blob instanceof Blob) w.__blobs.push(blob);
      return create(blob);
    };
    window.open = () => null;
  });
}

/** Opens the edit form of a real book that has a digital copy, on the copies tab (where the ebook file is). */
async function openDigitalBook(page: Page) {
  await fakeWrites(page);
  await page.goto('/books');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const title = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const { data } = await supabase.from('products').select('title, product_variants(variant_type)').eq('is_bundle', false).eq('is_active', true);
    type Row = { title: string; product_variants: { variant_type: string }[] };
    const rows = (data ?? []) as unknown as Row[];
    const count = new Map<string, number>();
    for (const r of rows) count.set(r.title.trim(), (count.get(r.title.trim()) ?? 0) + 1);
    return rows.find((r) => count.get(r.title.trim()) === 1 && r.product_variants.some((v) => v.variant_type === 'رقمي'))?.title.trim() ?? null;
  });
  test.skip(!title, 'لا يوجد كتاب بنسخة رقمية للاختبار');
  await page.getByPlaceholder('ابحث بالعنوان، المؤلف، ISBN...').fill(title!);
  const row = page.locator('tbody tr').filter({ has: page.locator('span.truncate', { hasText: title! }) }).first();
  await expect(row).toBeVisible();
  await row.getByTitle('تعديل').click();
  await page.getByRole('button', { name: /أنواع النسخ/ }).click();
  await expect(page.locator(FILE_INPUT)).toBeAttached();
}

/** Hands a file built inside the page to the ebook file input, as if it had been picked. */
async function pickBuilt(page: Page, build: string) {
  await page.evaluate(async (code) => {
    const make = new Function(`return (async () => { ${code} })()`) as () => Promise<File>;
    const file = await make();
    const input = document.querySelector('input[type="file"][accept=".pdf,.epub,.mobi"]') as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, build);
}

/**
 * A scanned-book PDF: every page is one big JPEG of Arabic text with scanner softness and paper grain
 * (about 2.5 MB a page at 343 dpi), built by hand so it needs no library.
 */
const scannedPdf = (pages: number) => `
  const W = 2000, H = 2830, pages = ${pages};
  const lines = ['بسم الله الرحمن الرحيم الحمد لله رب العالمين والصلاة والسلام على أشرف الأنبياء والمرسلين',
    'أما بعد فهذا كتاب جمعت فيه ما تيسر من مسائل الفقه وأحكام الطهارة والصلاة على المذهب',
    'قال الإمام رحمه الله تعالى باب صفة الوضوء فرائضه ستة غسل الوجه واليدين ومسح الرأس والرجلين',
    'ويستحب أن يبدأ بالسواك وأن يسمي الله تعالى وأن يغسل كفيه ثلاثا قبل إدخالهما الإناء'];
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const enc = new TextEncoder(); const parts = []; let length = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); length += b.length; };
  const offsets = [];
  const obj = (n, body) => { offsets[n] = length; push(n + ' 0 obj\\n'); push(body); push('\\nendobj\\n'); };
  push('%PDF-1.4\\n');
  const kids = []; for (let i = 0; i < pages; i++) kids.push((3 + i * 3) + ' 0 R');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Count ' + pages + ' /Kids [' + kids.join(' ') + '] >>');
  for (let n = 0; n < pages; n++) {
    ctx.fillStyle = '#efe9da'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1b1a18'; ctx.direction = 'rtl'; ctx.textAlign = 'right';
    const px = Math.round(W * 0.028); ctx.font = px + 'px "Geeza Pro", "Noto Naskh Arabic", serif';
    let li = n; for (let y = 200 + px; y < H - 200; y += Math.round(px * 1.9)) ctx.fillText(lines[li++ % lines.length], W - 200, y);
    ctx.filter = 'blur(0.8px)'; ctx.drawImage(canvas, 0, 0); ctx.filter = 'none';
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const g = (rnd() - 0.5) * 24; d[i] += g; d[i + 1] += g; d[i + 2] += g; }
    ctx.putImageData(img, 0, 0);
    const jpeg = new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.95))).arrayBuffer());
    const page = 3 + n * 3, image = page + 1, content = page + 2;
    obj(page, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 419.5 595.3] /Resources << /XObject << /Im0 ' + image + ' 0 R >> >> /Contents ' + content + ' 0 R >>');
    offsets[image] = length;
    push(image + ' 0 obj\\n<< /Type /XObject /Subtype /Image /Width ' + W + ' /Height ' + H + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\\nstream\\n');
    push(jpeg); push('\\nendstream\\nendobj\\n');
    const draw = 'q 419.5 0 0 595.3 0 0 cm /Im0 Do Q';
    obj(content, '<< /Length ' + draw.length + ' >>\\nstream\\n' + draw + '\\nendstream');
  }
  const total = 3 + pages * 3, xref = length;
  push('xref\\n0 ' + total + '\\n0000000000 65535 f \\n');
  for (let i = 1; i < total; i++) push(String(offsets[i]).padStart(10, '0') + ' 00000 n \\n');
  push('trailer\\n<< /Size ' + total + ' /Root 1 0 R >>\\nstartxref\\n' + xref + '\\n%%EOF\\n');
  return new File(parts, 'scanned-book.pdf', { type: 'application/pdf' });
`;

const sizeOf = (page: Page) => page.evaluate(() => {
  const blobs = (window as unknown as { __blobs: Blob[] }).__blobs;
  return blobs.length ? blobs[blobs.length - 1].size : null;
});

test('كتاب ممسوح أكبر من 50 م.ب: يتضغط تلقائيًا لتحت الحد ويفضل PDF سليم', async ({ page }) => {
  await openDigitalBook(page);
  await pickBuilt(page, scannedPdf(30));            // ≈ 75 MB

  await expect(page.getByTestId('ebook-shrinking')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/واتضغط لـ/)).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId('ebook-shrinking')).toBeHidden();
  const status = page.getByText(/اتضغط من/);
  await expect(status).toBeVisible();

  // The file's own preview button ("معاينة الكتاب" at the top of the form opens the store instead).
  await page.getByRole('button', { name: 'معاينة', exact: true }).first().click();
  const bytes = await sizeOf(page);
  expect(bytes).not.toBeNull();
  expect(bytes!).toBeLessThanOrEqual(LIMIT);
  expect(bytes!).toBeGreaterThan(5 * 1024 * 1024);                 // shrunk, not emptied
  const { head, tail } = await page.evaluate(async () => {
    const blobs = (window as unknown as { __blobs: Blob[] }).__blobs;
    const blob = blobs[blobs.length - 1];
    const text = async (b: Blob) => new TextDecoder('latin1').decode(await b.arrayBuffer());
    return { head: await text(blob.slice(0, 8)), tail: await text(blob.slice(blob.size - 32)) };
  });
  expect(head.startsWith('%PDF-')).toBe(true);
  expect(tail).toContain('%%EOF');

  // Handy for inspecting what the browser produced (page count, renders) outside the test.
  if (process.env.E2E_SAVE_COMPRESSED) {
    const target = process.env.E2E_SAVE_COMPRESSED;
    fs.writeFileSync(target, Buffer.alloc(0));
    for (let from = 0; from < bytes!; from += 8 * 1024 * 1024) {
      const chunk = await page.evaluate(async ([start]) => {
        const blobs = (window as unknown as { __blobs: Blob[] }).__blobs;
        const blob = blobs[blobs.length - 1].slice(start, start + 8 * 1024 * 1024);
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      }, [from]);
      fs.appendFileSync(target, Buffer.from(chunk, 'base64'));
    }
  }
});

test('الضغط ممكن يتلغى، والنموذج يرجع زي ما هو', async ({ page }) => {
  await openDigitalBook(page);
  await pickBuilt(page, scannedPdf(22));            // ≈ 55 MB: over the limit
  await expect(page.getByTestId('ebook-shrinking')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('ebook-shrinking').getByRole('button', { name: 'إلغاء' }).click();
  await expect(page.getByText('اتلغى ضغط الملف.')).toBeVisible();
  await expect(page.getByTestId('ebook-shrinking')).toBeHidden();
  await expect(page.getByText(/اتضغط من/)).toHaveCount(0);
});

test('ملف PDF صغير بيتختار زي ما هو من غير أي ضغط', async ({ page }) => {
  await openDigitalBook(page);
  await pickBuilt(page, `return new File([new Uint8Array(1024 * 1024)], 'small.pdf', { type: 'application/pdf' });`);
  await expect(page.getByText('تم اختيار الملف: small.pdf')).toBeVisible();
  await expect(page.getByTestId('ebook-shrinking')).toHaveCount(0);
  await expect(page.getByText(/اتضغط من/)).toHaveCount(0);
  await expect(page.getByText(/small\.pdf/).first()).toBeVisible();
});

test('EPUB أكبر من 50 م.ب مرفوض برسالة واضحة', async ({ page }) => {
  await openDigitalBook(page);
  await pickBuilt(page, `return new File([new Uint8Array(51 * 1024 * 1024)], 'huge.epub', { type: 'application/epub+zip' });`);
  await expect(page.getByText(/وأكبر من الحد المسموح \(50 م\.ب\)\. الضغط التلقائي متاح لملفات PDF بس/)).toBeVisible();
  await expect(page.getByText(/huge\.epub/)).toHaveCount(0);
});

test('PDF تالف أكبر من 50 م.ب مرفوض برسالة واضحة ومش بيتعلق', async ({ page }) => {
  await openDigitalBook(page);
  await pickBuilt(page, `return new File([new Uint8Array(52 * 1024 * 1024)], 'broken.pdf', { type: 'application/pdf' });`);
  await expect(page.getByText(/تعذّرت قراءة ملف الـ PDF/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('ebook-shrinking')).toBeHidden();
});
