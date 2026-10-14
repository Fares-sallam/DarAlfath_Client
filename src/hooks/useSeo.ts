import { useEffect } from 'react';
import { DEFAULT_DESCRIPTION, headTags, staticSeo, titleFor, type Seo } from '@/lib/seo';


/** The address the site is known by: pinned at build time, otherwise the one the page was opened on. */
export const siteOrigin = (): string => (typeof __SITE_URL__ === 'string' && __SITE_URL__) || window.location.origin;

const GENERIC =
  'meta[name="description"], meta[name="robots"], link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"], script[type="application/ld+json"][data-seo]';

/**
 * Writes a page's title and tags into the document, the same ones the edge functions put in the
 * HTML a crawler is sent (so what the app shows and what was served never disagree).
 */
export function applySeo(seo: Seo): void {
  const origin = siteOrigin();
  document.title = seo.title;
  document.head.querySelectorAll(GENERIC).forEach((node) => node.remove());
  const template = document.createElement('template');
  template.innerHTML = headTags(seo, origin);
  document.head.append(...Array.from(template.content.children));
}

/** The tags of the page the app was opened on, set when a page lets go of them. */
const resetSeo = () => applySeo(staticSeo('home', siteOrigin()));

/** A page's title, description, preview and structured data. Null: nothing yet (e.g. the book is still loading). */
export function useSeo(seo: Seo | null | undefined): void {
  const key = seo ? JSON.stringify(seo) : '';
  useEffect(() => {
    if (!seo) return;
    applySeo(seo);
    return resetSeo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** A page that belongs to the visitor (cart, account, orders…): titled, and kept out of search results. */
export function usePrivateSeo(title: string, path: string): void {
  useSeo({ title: titleFor(title), description: DEFAULT_DESCRIPTION, path, noindex: true });
}
