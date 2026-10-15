import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnnouncements, type AnnouncementItem } from '@/hooks/useStorefront';

const TURN_MS = 5000;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A message's own link: inside the store as a page change, anywhere else in a new tab. */
function MessageLink({ item }: { item: AnnouncementItem }) {
  const url = item.link_url?.trim();
  if (!url) return <span>{item.message}</span>;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return <Link to={`${parsed.pathname}${parsed.search}${parsed.hash}`}>{item.message}</Link>;
    }
  } catch {
    return <span>{item.message}</span>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {item.message}
    </a>
  );
}

/**
 * The offers and notices strip under the header, written in the dashboard (إدارة الإعلانات والأشرطة).
 * Several messages take turns every five seconds; pointing at the strip or tabbing into it holds the
 * current one. With no live message the strip isn't there at all.
 */
export default function AnnouncementBar() {
  const { data: items = [] } = useAnnouncements();
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const count = items.length;

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || held || prefersReducedMotion()) return undefined;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), TURN_MS);
    return () => window.clearTimeout(timer);
  }, [count, held, index]);

  if (count === 0) return null;
  const item = items[Math.min(index, count - 1)];

  return (
    <section
      className="announcement-bar"
      aria-label="عروض وإعلانات"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="container announcement-bar__inner">
        <p key={item.id} className="announcement-bar__message" data-testid="announcement">
          <MessageLink item={item} />
        </p>
        {count > 1 && (
          <div className="announcement-bar__dots" aria-hidden="true">
            {items.map((it, i) => (
              <span key={it.id} className={i === index ? 'is-on' : undefined} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
