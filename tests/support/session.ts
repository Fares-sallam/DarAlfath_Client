import fs from 'node:fs';
import path from 'node:path';

/**
 * Signing in for the end-to-end tests, now that Supabase Auth asks for a Cloudflare Turnstile check (a robot cannot pass it).
 *
 * A person signs in once, by hand, with `npm run e2e:login`; that saves the test account's session in
 * playwright/.auth/session.json. Every run then renews the session with its refresh token (a refresh needs no captcha),
 * writes the renewed one back, and hands it to the tests: the dashboard as a storage state, the store as a script that
 * puts the session where the Supabase client looks for it. Nothing here sees or stores a password.
 */

export const AUTH_DIR = path.resolve('playwright/.auth');
export const SESSION_FILE = path.join(AUTH_DIR, 'session.json');
export const ADMIN_STATE_FILE = path.join(AUTH_DIR, 'admin.json');

/** The key each app's Supabase client keeps its session under (the dashboard names it; the store uses the default). */
export const DASHBOARD_STORAGE_KEY = 'darelfath-auth-token';
export const storefrontStorageKey = (supabaseUrl: string) => `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
}

export const hasSavedSession = (): boolean => fs.existsSync(SESSION_FILE);

export function readSession(): StoredSession {
  const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) as StoredSession;
  if (!session.refresh_token) throw new Error('الجلسة المحفوظة ناقصة (مفيش refresh token). شغّل: npm run e2e:login');
  return session;
}

export function writeSession(session: StoredSession): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

/** Trades the saved refresh token for a fresh session (the old token is spent: the new one must be saved). */
export async function refreshSession(
  supabaseUrl: string,
  anonKey: string,
  session: StoredSession,
  fetchImpl: typeof fetch = fetch,
): Promise<StoredSession> {
  const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) {
    throw new Error(
      `تعذّر تجديد جلسة حساب الاختبار (${response.status}). الجلسة المحفوظة انتهت أو اتستخدمت من مكان تاني، سجّل دخول يدوي مرة واحدة: npm run e2e:login`,
    );
  }
  const next = (await response.json()) as StoredSession;
  if (!next.access_token || !next.refresh_token) throw new Error('رد تجديد الجلسة ناقص');
  return next;
}

/** A Playwright storage state holding the session in one origin's localStorage. */
export function storageStateFor(origin: string, key: string, session: StoredSession) {
  return { cookies: [], origins: [{ origin, localStorage: [{ name: key, value: JSON.stringify(session) }] }] };
}
