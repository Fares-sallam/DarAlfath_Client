import { Link } from 'react-router-dom';

const LOCKUP = '/branding/logo-horizontal.svg';
const LOCKUP_NIGHT = '/branding/logo-horizontal-dark.svg';

/**
 * The house lockup (mark + Arabic and English names) from the brand files.
 * The theme is a class on <html>, not a media query, so both drawings are in
 * the page and CSS shows the one that matches: navy lettering on the light
 * surface, mint lettering on the night one. `onDark` is for surfaces that are
 * dark in both themes (the footer), which always take the mint drawing.
 *
 * store_settings.logo_url is no longer read here: an uploaded logo is one
 * picture, and the lockup needs a light and a night version.
 */
export default function Logo({ small = false, disableLink = true, onDark = false }: { small?: boolean; disableLink?: boolean; onDark?: boolean }) {
  const cls = ['brand-lockup', small && 'brand-lockup--small', onDark && 'brand-lockup--on-dark'].filter(Boolean).join(' ');
  const content = (
    <span className={cls}>
      {!onDark && <img src={LOCKUP} alt="دار الفتح للنشر والتوزيع" className="brand-lockup__img brand-lockup__img--day" width={3214} height={850} />}
      <img src={LOCKUP_NIGHT} alt="دار الفتح للنشر والتوزيع" className="brand-lockup__img brand-lockup__img--night" width={3214} height={850} />
    </span>
  );
  return disableLink ? content : <Link to="/" aria-label="دار الفتح للنشر والتوزيع، الصفحة الرئيسية">{content}</Link>;
}
