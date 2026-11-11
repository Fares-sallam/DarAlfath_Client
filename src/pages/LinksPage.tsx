import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LinksPageView, { LinksPageClosed, LinksPageSkeleton } from '@/components/links/LinksPageView';
import { useLinksPage } from '@/hooks/useLinksPage';
import { useTheme } from '@/contexts/ThemeContext';
import { siteOrigin, useSeo } from '@/hooks/useSeo';
import { linksPageSeo } from '@/lib/seo';
import { DEFAULT_LINKS_SETTINGS, makeBlock, type LinksBlock } from '@/lib/linksPage';

/** What the page draws when its content cannot be read, or has nothing on it yet: the two ways into the store. */
const FALLBACK_BLOCKS: LinksBlock[] = [
  makeBlock('link', { id: 'fallback-store', sort_order: 0, title: 'تسوّق من المتجر', body: 'كتب دار الفتح الورقية والرقمية', url: '/', icon: 'store', look: { style: 'primary', display: 'button' } }),
  makeBlock('link', { id: 'fallback-contact', sort_order: 1, title: 'تواصل معنا', url: '/contact', icon: 'email', look: { style: 'mint', display: 'button' } }),
];

/**
 * The company links page (/links): one place for the store, the app, the social accounts and the
 * current offers, set from the dashboard (إدارة الصفحة والروابط). It stands on its own, without the
 * store's header and footer, since it is mostly opened from a bio or a chat.
 */
export default function LinksPage() {
  const { data, isLoading } = useLinksPage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const settings = data?.settings ?? DEFAULT_LINKS_SETTINGS;
  useSeo(linksPageSeo(settings, siteOrigin()));

  // Past the page's own edges (the bounce at the end of a scroll) the page's colour shows, not the store's.
  useEffect(() => {
    const previous = document.body.style.background;
    document.body.style.background = theme === 'dark' ? '#00102a' : '#f7fbfa';
    return () => {
      document.body.style.background = previous;
    };
  }, [theme]);

  if (isLoading) return <LinksPageSkeleton theme={theme} />;
  if (!settings.is_enabled) return <LinksPageClosed theme={theme} onNavigate={navigate} />;

  return (
    <LinksPageView
      settings={settings}
      blocks={data && data.blocks.length > 0 ? data.blocks : FALLBACK_BLOCKS}
      theme={theme}
      onToggleTheme={toggleTheme}
      onNavigate={navigate}
    />
  );
}
