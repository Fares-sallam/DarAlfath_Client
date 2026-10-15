import { siteOrigin } from '@/hooks/useSeo';
import { absoluteUrl } from '@/lib/seo';
import { showToast } from '@/lib/toast';

export const bookShareUrl = (productId: string) => absoluteUrl(siteOrigin(), `/book/${productId}`);

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // An older browser, or one that refuses the clipboard outside a secure page.
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    field.remove();
    return ok;
  }
}

/**
 * A phone opens its own share sheet (WhatsApp, Messenger, …). Elsewhere the link is copied and a
 * note says so. The link is the book's page, whose preview (cover, title, price) the edge functions
 * already write for WhatsApp and Facebook.
 */
export async function shareBook(book: { id: string; title: string }): Promise<void> {
  const url = bookShareUrl(book.id);
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: book.title, text: `${book.title} من دار الفتح`, url });
      return;
    } catch (err) {
      // Closing the sheet is not a failure; anything else falls back to copying.
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  showToast((await copyText(url)) ? 'اتنسخ رابط الكتاب' : `رابط الكتاب: ${url}`);
}
