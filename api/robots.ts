/** /robots.txt — public for the OAuth hostname and real domain, closed on preview hosts. */
import { robotsTxt } from '../src/lib/seo';
import { siteOrigin } from './_shared';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Response {
  return new Response(robotsTxt(siteOrigin(request), new URL(request.url).hostname), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, s-maxage=3600' },
  });
}
