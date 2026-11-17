import { Link } from 'react-router-dom';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  /** Which of the dashboard's button colours the link follows: «عرض الكل» or «عرض التصنيف». */
  linkKind?: 'view_all' | 'view_category';
  /** The page's own heading (h1) where nothing above it is one. */
  as?: 'h1' | 'h2';
}

export default function SectionHeader({ title, subtitle, href, linkLabel = 'عرض الكل', linkKind = 'view_all', as: Heading = 'h2' }: SectionHeaderProps) {
  return (
    <div className="section-heading">
      <div>
        <Heading>{title}</Heading>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {href ? <Link to={href} data-ab-btn={linkKind}>{linkLabel}</Link> : null}
    </div>
  );
}
