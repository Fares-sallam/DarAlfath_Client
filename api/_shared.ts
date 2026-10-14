/**
 * Shared by the edge functions in this folder (a leading underscore keeps it from being a route).
 */

declare const process: { env: Record<string, string | undefined> };

/**
 * The address the site is known by: set VITE_SITE_URL to pin it, otherwise the production domain
 * Vercel reports (a custom domain once one is the primary one), otherwise the one the request
 * came to. Moving to a new domain therefore needs no code change.
 */
export function siteOrigin(request: Request): string {
  const pinned = process.env.VITE_SITE_URL?.trim();
  if (pinned) return pinned.replace(/\/$/, '');
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  return new URL(request.url).origin;
}

/**
 * A read from the store's database with the public (anon) key — only what the site itself
 * already shows to anyone. Null on any failure, so a page is never held up by it.
 */
export async function rest<T>(query: string, timeoutMs = 3500): Promise<T[] | null> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data) ? (data as T[]) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A PostgREST filter value: only plain slugs and ids go in. */
export const safeFilterValue = (value: string | null | undefined): string | null =>
  value && /^[\p{L}\p{N}_\-ـ]{1,120}$/u.test(value) ? value : null;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
