import fs from 'node:fs';
import { test as setup, expect } from '@playwright/test';
import {
  ADMIN_STATE_FILE, AUTH_DIR, DASHBOARD_STORAGE_KEY, hasSavedSession, readSession, refreshSession, storageStateFor, writeSession,
} from '../support/session';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const DASHBOARD_ORIGIN = process.env.E2E_DASHBOARD_URL || 'http://127.0.0.1:8080';

// Runs first for every project: it renews the test account's session once, so that no test refreshes it (a refresh
// token is single-use) and every test starts signed in. The dashboard gets it as a storage state, the store reads
// ~/.daralfath-e2e/session.json (see storefront/helpers.ts).
setup('جلسة حساب الاختبار (تجديد من الجلسة المحفوظة، أو دخول بالفورم لو الكابتشا مقفولة)', async ({ page }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  if (hasSavedSession()) {
    expect(SUPABASE_URL, 'VITE_SUPABASE_URL مفقود (.env.local)').not.toBe('');
    expect(SUPABASE_ANON_KEY, 'VITE_SUPABASE_ANON_KEY مفقود (.env.local)').not.toBe('');
    const renewed = await refreshSession(SUPABASE_URL, SUPABASE_ANON_KEY, readSession());
    writeSession(renewed);
    fs.writeFileSync(ADMIN_STATE_FILE, JSON.stringify(storageStateFor(DASHBOARD_ORIGIN, DASHBOARD_STORAGE_KEY, renewed)), { mode: 0o600 });
    return;
  }

  // No saved session: the form still works while Supabase's captcha protection is off. With it on, run `npm run e2e:login` once.
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    // the tests that need an account will say so themselves; the ones that do not still run
    fs.writeFileSync(ADMIN_STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, 'مفيش جلسة محفوظة ولا بيانات حساب في .env.e2e: شغّل npm run e2e:login مرة واحدة');
  }

  await page.goto('/login');
  await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
  await page.context().storageState({ path: ADMIN_STATE_FILE });
});
