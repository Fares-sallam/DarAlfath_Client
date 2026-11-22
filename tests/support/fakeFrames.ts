import type { Frame, Page } from '@playwright/test';

/**
 * The dashboard's live previews frame the real website and a web copy of the app. In a hermetic test those two addresses are
 * answered here by a tiny page that says it is ready (like the real ones do) and keeps every message it is sent, so a spec can
 * check what the dashboard sends without any network. `silent` makes the page never say it is ready (a frame that fails to load).
 */
const SITE_READY = 'daralfath:display-preview-ready';
const APP_READY = 'daralfath:app-preview-ready';

const childPage = (readyType: string, silent: boolean) => `<!doctype html><meta charset="utf-8"><title>fake</title><body data-count="0">fake preview
<script>
  window.__messages = [];
  window.addEventListener('message', function (e) { window.__messages.push(e.data); document.body.setAttribute('data-count', String(window.__messages.length)); });
  ${silent ? '' : `parent.postMessage({ type: '${readyType}' }, '*');`}
</script>`;

export async function fakeFrames(page: Page, opts: { silent?: boolean } = {}): Promise<void> {
  const silent = Boolean(opts.silent);
  await page.route(/[?&]preview=display/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: childPage(SITE_READY, silent) }));
  await page.route(/dar-alfath-app-preview\.vercel\.app/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: childPage(APP_READY, silent) }));
}

const frameOf = (page: Page, place: 'site' | 'app'): Frame | undefined =>
  page.frames().find((f) => (place === 'site' ? /[?&]preview=display/.test(f.url()) : /dar-alfath-app-preview\.vercel\.app/.test(f.url())));

/** Every message the framed page has been sent, oldest first. */
export async function messagesOf(page: Page, place: 'site' | 'app'): Promise<any[]> {
  const frame = frameOf(page, place);
  return frame ? frame.evaluate(() => (window as unknown as { __messages: unknown[] }).__messages ?? []) : [];
}

export async function lastMessage(page: Page, place: 'site' | 'app'): Promise<any | undefined> {
  const all = await messagesOf(page, place);
  return all[all.length - 1];
}
