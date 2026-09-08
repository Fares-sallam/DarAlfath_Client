import { Link } from 'react-router-dom';
import { useStoreSettings } from '@/hooks/useStorefront';

const STATIC_LOGO = '/branding/dar-alfath-logo.jpeg';

export default function Logo({ small = false, disableLink = true }: { small?: boolean; disableLink?: boolean }) {
  // Same store_settings.logo_url row the dashboard's Settings page writes
  // to when the admin uploads a new logo — falls back to the bundled
  // static file only when no custom logo has been uploaded (or on a
  // fetch error, via useStoreSettings' own fallbackSettings). This was
  // previously hardcoded to the static file only, so a logo change in the
  // dashboard never reached the storefront.
  const { data: settings } = useStoreSettings();
  const logoSrc = settings?.logo_url || STATIC_LOGO;

  const content = (
    <div className="brand-logo">
      <img
        src={logoSrc}
        alt="دار الفتح للنشر والتوزيع"
        className={small ? 'brand-logo__image brand-logo__image--small' : 'brand-logo__image'}
      />
      <div className="brand-logo__text">
        <div className={small ? 'brand-logo__title brand-logo__title--small' : 'brand-logo__title'}>
          دار الفتح للنشر والتوزيع
        </div>
        <div className="brand-logo__sub">Dar Al-Fath Publishing & Distribution</div>
      </div>
    </div>
  );
  return disableLink ? content : <Link to="/">{content}</Link>;
}
