// One-time sign-in for the end-to-end tests (npm run e2e:login).
// Supabase Auth now asks for a Turnstile check, so a robot cannot sign in. This opens a real browser on the live
// dashboard: sign in there with the TEST account, by hand (you also pass the check). The script waits for the session,
// saves it to playwright/.auth/session.json, and closes. After that every test run renews it by itself.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'https://dar-alfath-dashboard.vercel.app/login';
const KEY = 'darelfath-auth-token';
const dir = path.resolve('playwright/.auth');

const browser = await chromium.launch({ headless: false });
const page = await (await browser.newContext()).newPage();
await page.goto(url);
console.log(`افتح المتصفح اللي ظهر، وسجّل دخول بحساب الاختبار (حل التحقق بإيدك). مستنّي لحد 5 دقايق...`);

const started = Date.now();
let raw = null;
while (Date.now() - started < 5 * 60_000) {
  raw = await page.evaluate((k) => localStorage.getItem(k), KEY).catch(() => null);
  if (raw) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await browser.close();

if (!raw) {
  console.error('ما اتسجلش دخول في الوقت المحدد. جرّب تاني.');
  process.exit(1);
}
const session = JSON.parse(raw);
if (!session.refresh_token) {
  console.error('الجلسة اللي اتسجلت ناقصة.');
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session, null, 2), { mode: 0o600 });
console.log('تم. الجلسة اتحفظت في playwright/.auth/session.json (الملف ده مش بيترفع على git).');
