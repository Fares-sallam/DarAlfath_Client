import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../fixtures';
import { APP_SHELL, LEGACY_APP_SHELL } from '../../api/_shared';

// How the app's own HTML is named and routed. On Vercel a file called index.html is what the domain root `/` is answered with, ahead
// of any rewrite, so the links page (which the root is) never reached its function: WhatsApp and Facebook were sent the shell's own
// (store home) title, description and canonical instead of the links page's. The production build now renames it to app.html.
// Nothing here needs a browser or a network.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
type Rule = { source: string; destination?: string; headers?: { key: string; value: string }[] };
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as { rewrites: Rule[]; redirects: Rule[]; headers: Rule[] };

test('vercel.json: كل مسار مالوش صفحة بيروح لـ app.html، والجذر لدالة صفحة الروابط، والمتجر لدالة الرئيسية', () => {
  const rewrites = config.rewrites;
  expect(rewrites[rewrites.length - 1]).toEqual({ source: '/(.*)', destination: APP_SHELL });
  expect(rewrites.find((r) => r.source === '/')?.destination).toBe('/api/page?kind=links');
  expect(rewrites.find((r) => r.source === '/store')?.destination).toBe('/api/page?kind=home');
  // the function's own rules come before the catch-all
  expect(rewrites.findIndex((r) => r.source === '/')).toBeLessThan(rewrites.length - 1);
  // nothing sends anyone to the old name
  expect(JSON.stringify(config)).not.toContain('index.html');
  expect(APP_SHELL).toBe('/app.html');
  expect(LEGACY_APP_SHELL).toBe('/index.html');
});

test('vercel.json: ملف app.html نفسه مش صفحة تظهر في نتايج البحث', () => {
  const rule = config.headers.find((h) => h.source === '/app.html');
  expect(rule?.headers?.some((h) => h.key === 'X-Robots-Tag' && /noindex/.test(h.value))).toBe(true);
});

/** A production-style build (VERCEL set) or a plain one, into a folder of its own. */
function build(vercel: boolean): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-build-'));
  const env = { ...process.env } as Record<string, string | undefined>;
  delete env.VERCEL;
  if (vercel) env.VERCEL = '1';
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: ROOT, env: env as NodeJS.ProcessEnv, stdio: 'pipe' });
  return out;
}

test('البناء على Vercel: app.html مكان index.html، وcaptcha.html والصور زي ما هم؛ وأي بناء تاني بيسيب index.html', () => {
  test.setTimeout(120_000);
  const production = build(true);
  try {
    expect(fs.existsSync(path.join(production, 'index.html'))).toBe(false); // so `/` is not answered by a file
    const shell = fs.readFileSync(path.join(production, 'app.html'), 'utf8');
    expect(shell).toContain('id="root"');
    expect(shell).toMatch(/<script type="module"[^>]*src="\/assets\/main-/);
    expect(fs.existsSync(path.join(production, 'captcha.html'))).toBe(true); // the app's security check page is untouched
    expect(fs.existsSync(path.join(production, 'favicon.ico'))).toBe(true);
    expect(fs.existsSync(path.join(production, 'branding', 'logo-mark.svg'))).toBe(true);
  } finally {
    fs.rmSync(production, { recursive: true, force: true });
  }

  const plain = build(false);
  try {
    expect(fs.existsSync(path.join(plain, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(plain, 'app.html'))).toBe(false);
  } finally {
    fs.rmSync(plain, { recursive: true, force: true });
  }
});
