import { Link } from 'react-router-dom';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}

export default function SectionHeader({ title, subtitle, href, linkLabel = 'عرض الكل' }: SectionHeaderProps) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {href ? <Link to={href}>{linkLabel}</Link> : null}
    </div>
  );
}
