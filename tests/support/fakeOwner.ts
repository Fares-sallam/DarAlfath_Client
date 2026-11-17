import type { Page, Route } from '@playwright/test';

/**
 * A dashboard that is signed in as the owner without signing in: a session in local storage, every Supabase auth
 * call answered here, and every other table empty (a read finds nothing, a write is accepted and dropped).
 * Supabase Auth asks a robot for a Turnstile check it cannot pass, so the specs that only need a signed-in dashboard
 * (their own tables are answered by the spec itself, registered after this) use it instead of the real sign-in.
 * Register a spec's own routes AFTER calling it: the last route registered answers first.
 */
export const OWNER_EMAIL = 'faresalsaid780@gmail.com';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const user = (email: string) => ({
  id: OWNER_ID, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2020-01-01T00:00:00Z',
});

export async function signInAsFakeOwner(page: Page, email: string = OWNER_EMAIL): Promise<void> {
  await page.addInitScript(([mail, id]) => {
    const owner = { id, aud: 'authenticated', role: 'authenticated', email: mail, app_metadata: {}, user_metadata: {}, created_at: '2020-01-01T00:00:00Z' };
    localStorage.setItem('darelfath-auth-token', JSON.stringify({
      access_token: 'a.b.c', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86_400,
      refresh_token: 'r', user: owner,
    }));
  }, [email, OWNER_ID]);

  await page.route('**/auth/v1/**', (route) => (route.request().url().includes('/auth/v1/user') ? json(route, user(email)) : json(route, {})));

  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return wantsObject ? json(route, { code: 'PGRST116', message: 'no rows' }, 406) : json(route, []);
    }
    return route.fulfill({ status: 201, body: '' });
  });
}
