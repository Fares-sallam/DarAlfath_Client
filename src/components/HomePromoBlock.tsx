import { Link } from 'react-router-dom';
import type { PromoTone } from '@/lib/homeBlocks';

interface Props {
  title: string | null;
  text: string | null;
  imageUrl: string | null;
  /** the page the button opens on the website, or null (no button) */
  href: string | null;
  buttonLabel: string | null;
  tone: PromoTone;
}

/** A free strip between the home page's shelves, written in the dashboard: words, a picture and a button. */
export default function HomePromoBlock({ title, text, imageUrl, href, buttonLabel, tone }: Props) {
  const hasCopy = Boolean(title || text);
  const button = href && buttonLabel ? buttonLabel : null;
  const className = `home-promo home-promo--${tone}${imageUrl ? ' home-promo--picture' : ''}${hasCopy ? '' : ' home-promo--picture-only'}`;
  return (
    <div className={className} data-testid="home-promo" data-tone={tone}>
      {hasCopy && (
        <div className="home-promo__copy">
          {title ? <h2>{title}</h2> : null}
          {text ? <p>{text}</p> : null}
          {button ? <Link to={href as string} className="home-promo__button">{button}</Link> : null}
        </div>
      )}
      {imageUrl ? <img className="home-promo__image" src={imageUrl} alt="" loading="lazy" decoding="async" /> : null}
      {/* no button: the whole strip opens the page, so a picture on its own is still a link */}
      {href && !button ? <Link to={href} className="home-promo__cover" aria-label={title ?? 'افتح'} /> : null}
    </div>
  );
}
