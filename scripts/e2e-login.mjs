// One-time sign-in for the end-to-end tests (npm run e2e:login).
// Supabase Auth asks for a Turnstile check, and Cloudflare refuses the browsers that automation tools open
// ("Chrome for Testing"). So there are two ways in; both save the TEST account's session to ~/.daralfath-e2e/session.json
// (never commit it), and after that every test run renews it by itself.
//
//   npm run e2e:login             opens your installed Google Chrome (not the testing build) in a fresh profile, without the
//                                 automation flags. Sign in there by hand with the test account.
//   npm run e2e:login -- --paste  if the check still refuses that: sign in with the test account in a normal Chrome
//                                 INCOGNITO window on the live dashboard (an incognito sign-in is a session of its own, so it never
//                                 logs your everyday browser out), open its console (Cmd+Option+J) and run
//                                     copy(localStorage.getItem('darelfath-auth-token'))
//                                 then run this command: it reads the clipboard.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KEY = 'darelfath-auth-token';
// outside the project, so a new clone does not lose it (same place as tests/support/session.ts)
const dir = process.env.E2E_SESSION_DIR || path.join(os.homedir(), '.daralfath-e2e');
const args = process.argv.slice(2);
const paste = args.includes('--paste');
const url = args.find((a) => a.startsWith('http')) || 'https://dar-alfath-dashboard.vercel.app/login';

function save(raw) {
  let session;
  try { session = JSON.parse(raw); } catch { session = null; }
  if (!session || !session.refresh_token || !session.access_token) {
    console.error('اللي اتنسخ مش جلسة صالحة. لازم تنفّذ الأمر copy(...) بعد ما تسجّل دخول، من غير ما تنسخ حاجة تانية.');
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session, null, 2), { mode: 0o600 });
  console.log(`تم. الجلسة اتحفظت في ${path.join(dir, 'session.json')} (برا المشروع، فمش بتترفع على git وبتفضل لو مسحت النسخة).`);
}

if (paste) {
  save(execFileSync('pbpaste', { encoding: 'utf8' }).trim());
  process.exit(0);
}

let browser;
try {
  // the installed Chrome, in a fresh profile, without the flags that mark it as automated
  browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled'],
  });
} catch {
  console.error('Google Chrome مش متثبّت أو ما اتفتحش. استخدم الطريقة التانية: npm run e2e:login -- --paste (الخطوات في أول ملف scripts/e2e-login.mjs)');
  process.exit(1);
}
const page = await (await browser.newContext()).newPage();
await page.goto(url);
console.log('سجّل دخول في Chrome اللي اتفتح بحساب الاختبار (وحل التحقق بإيدك). مستنّي لحد 5 دقايق...');

const started = Date.now();
let raw = null;
while (Date.now() - started < 5 * 60_000) {
  raw = await page.evaluate((k) => localStorage.getItem(k), KEY).catch(() => null);
  if (raw) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await browser.close();
if (!raw) {
  console.error('ما اتسجلش دخول في الوقت المحدد. لو الاختبار الأمني بيترفض: npm run e2e:login -- --paste');
  process.exit(1);
}
save(raw);
