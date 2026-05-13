import { Link } from 'react-router-dom';

export default function Logo({ small = false, disableLink = true }: { small?: boolean; disableLink?: boolean }) {
  const content = (
    <div className="brand-logo">
      <img
        src="/branding/dar-alfath-logo.jpeg"
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
