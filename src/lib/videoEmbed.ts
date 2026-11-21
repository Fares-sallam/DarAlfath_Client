/**
 * A video link the dashboard saved for a page (https only), as something the page can show:
 * YouTube and Vimeo are played in their own player, a plain video file in the browser's, and any other
 * address is only offered as a link (a page we know nothing about is never put inside ours).
 */
export type VideoEmbed =
  | { kind: 'youtube'; id: string }
  | { kind: 'vimeo'; id: string }
  | { kind: 'file'; url: string }
  | { kind: 'link'; url: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;

export function parseVideo(raw: string | null | undefined): VideoEmbed | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:') return null;

  const host = url.hostname.replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const id = parts[0] ?? '';
    return YOUTUBE_ID.test(id) ? { kind: 'youtube', id } : { kind: 'link', url: url.href };
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const fromQuery = url.searchParams.get('v');
    const at = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live');
    const id = fromQuery ?? (at >= 0 ? parts[at + 1] ?? '' : '');
    return YOUTUBE_ID.test(id) ? { kind: 'youtube', id } : { kind: 'link', url: url.href };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parts.find((p) => /^\d+$/.test(p));
    return id ? { kind: 'vimeo', id } : { kind: 'link', url: url.href };
  }
  if (/\.(mp4|webm|ogg|mov)$/i.test(url.pathname)) return { kind: 'file', url: url.href };
  return { kind: 'link', url: url.href };
}
