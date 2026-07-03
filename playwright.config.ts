import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

/**
 * مجموعة اختبارات لتطبيقين منفصلين على نفس Supabase:
 *  - storefront: صفحة العميل (هذا المستودع)   → http://127.0.0.1:5173
 *  - dashboard : لوحة التحكم (مستودع منفصل)   → http://127.0.0.1:8080
 * كل تطبيق له مشروعه الخاص (testDir/baseURL) وسيرفر dev خاص به.
 * بيانات حساب الاختبار في .env.e2e (غير مرفوع على git).
 */
const DASHBOARD_DIR = process.env.E2E_DASHBOARD_DIR || '/Users/user/Desktop/DarAlfath_Dash';
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL || 'http://127.0.0.1:5173';
const DASHBOARD_URL = process.env.E2E_DASHBOARD_URL || 'http://127.0.0.1:8080';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // نحدّ التوازي: التستات تشغّل سيرفرَي dev حقيقيين لتطبيقين معًا، والتوازي الكامل
  // (عدد الأنوية) يسبّب تسابق موارد وتفاعلات UI غير مستقرة أحيانًا.
  workers: process.env.CI ? 1 : 2,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // ── صفحة العميل (الموقع) ──────────────────────────────────────────
    {
      name: 'storefront',
      testDir: './tests/storefront',
      use: { ...devices['Desktop Chrome'], baseURL: STOREFRONT_URL },
    },

    // ── لوحة التحكم: تسجيل دخول مرة واحدة، يُعاد استخدامه في باقي الاختبارات ──
    {
      name: 'dashboard-setup',
      testDir: './tests/dashboard',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: DASHBOARD_URL },
    },
    {
      name: 'dashboard',
      testDir: './tests/dashboard',
      testIgnore: /auth\.setup\.ts/,
      dependencies: ['dashboard-setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: DASHBOARD_URL,
        storageState: 'playwright/.auth/admin.json',
      },
    },
  ],

  /* يشغّل سيرفري الـdev تلقائيًا قبل الاختبارات (كل تطبيق من مجلده). */
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      url: STOREFRONT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 8080 --strictPort',
      cwd: DASHBOARD_DIR,
      url: DASHBOARD_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
