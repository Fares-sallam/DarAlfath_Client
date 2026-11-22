import { Link } from 'react-router-dom';
import { Facebook, Globe, Instagram, Mail, MapPin, MessageCircle, Phone, Youtube } from 'lucide-react';
import Logo from '@/components/Logo';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import { DEFAULT_DISPLAY, copyrightText, footerGrid, footerLinkKind, type FooterLink } from '@/lib/displaySettings';
import type { StoreSettings } from '@/types/store';

/** The line under the logo until one is written in the dashboard (الإعدادات → إعدادات المتجر). */
const DEFAULT_TAGLINE = 'ننشر المعرفة الهادفة ونبني جسرًا واسعًا من الكتب الأصيلة بين القارئ والعلم والثقافة والقيم.';

/** One link of a footer column: a page in the store is a router link, anything else a plain address (a site opens in a new tab). */
function FooterLinkItem({ link }: { link: FooterLink }) {
  const kind = footerLinkKind(link.url);
  if (kind === 'internal') return <Link to={link.url}>{link.label}</Link>;
  if (kind === 'external') return <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>;
  return <a href={link.url}>{link.label}</a>;
}

const DESIGNED_GRID = footerGrid(DEFAULT_DISPLAY.footer);

export default function Footer({ settings }: { settings: StoreSettings }) {
  // the link columns, the contact block and the two bottom lines are chosen in the dashboard (تفاصيل العرض)
  const { footer } = useDisplaySettings();
  const grid = footerGrid(footer);
  const copyright = copyrightText(footer.copyright, new Date().getFullYear());
  const note = footer.note.trim();
  // Admin-editable from the dashboard (الإعدادات → روابط التواصل الاجتماعي)
  // instead of hardcoded — only entries an admin actually filled in render,
  // so there's never a placeholder/dead link live on the site.
  const socialLinks = [
    { name: 'الموقع الرسمي', url: settings.website_url, icon: Globe },
    { name: 'فيسبوك', url: settings.facebook_url, icon: Facebook },
    { name: 'إنستجرام', url: settings.instagram_url, icon: Instagram },
    { name: 'واتساب', url: settings.whatsapp_url, icon: MessageCircle },
    { name: 'يوتيوب', url: settings.youtube_url, icon: Youtube },
  ].filter((item): item is typeof item & { url: string } => !!item.url);

  const align = settings.footer_tagline_align === 'center' || settings.footer_tagline_align === 'justify'
    ? settings.footer_tagline_align
    : 'start';

  return (
    <footer className="site-footer">
      <div
        className="container site-footer__grid"
        data-custom={grid === DESIGNED_GRID ? undefined : ''}
        style={grid === DESIGNED_GRID ? undefined : ({ '--footer-grid': grid } as React.CSSProperties)}
      >
        <div className={`site-footer__brand site-footer__brand--${align}`}>
          <Logo small onDark />
          <p>{settings.footer_tagline?.trim() || DEFAULT_TAGLINE}</p>

          {socialLinks.length > 0 && (
            <div className="site-footer__socials">
              {socialLinks.map((item) => {
                const Icon = item.icon;
                return <a key={item.name} href={item.url} target="_blank" rel="noreferrer" aria-label={item.name}><Icon size={18} /></a>;
              })}
            </div>
          )}
        </div>

        {footer.columns.map((column, c) => (
          <div key={`${column.title}-${c}`} data-testid={`footer-col-${c}`}>
            {column.title ? <h3>{column.title}</h3> : null}
            <div className="site-footer__links">
              {column.links.map((link) => <FooterLinkItem key={`${link.label}-${link.url}`} link={link} />)}
            </div>
          </div>
        ))}

        {footer.showContact ? (
          <div data-testid="footer-contact">
            <h3>بيانات التواصل</h3>
            <div className="site-footer__contact">
              <div><Phone size={16} /><span>{settings.store_phone || '—'}</span></div>
              <div><Mail size={16} /><span>{settings.store_email || '—'}</span></div>
              <div><MapPin size={16} /><span>{settings.store_address || '—'}</span></div>
            </div>
          </div>
        ) : null}
      </div>

      {copyright || note ? (
        <div className="container site-footer__bottom" data-testid="footer-bottom">
          {copyright ? <span>{copyright}</span> : null}
          {note ? <span>{note}</span> : null}
        </div>
      ) : null}
    </footer>
  );
}
