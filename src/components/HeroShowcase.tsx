import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useHomeHeroSlides } from '@/hooks/useStorefront';

const VISIBLE = 3;

/**
 * The homepage hero's focal content: admin-curated images on lit pedestals,
 * replacing the old all-text title panel. Renders inside Frontispiece's
 * frame (ornaments, wall texture, glow all still apply — only what fills
 * .frontispiece__inner has changed).
 *
 * Slides come from home_hero_slides (see useHomeHeroSlides), fully
 * independent of the products table so the dashboard can curate this
 * before the catalog itself is ready. Zero slides is a real, expected
 * state pre-launch — the stage just doesn't render, no placeholder box.
 */
export default function HeroShowcase() {
  const { data: slides = [] } = useHomeHeroSlides();
  const [page, setPage] = useState(0);

  if (slides.length === 0) return null;

  const pageCount = Math.ceil(slides.length / VISIBLE);
  const start = page * VISIBLE;
  const shown = slides.slice(start, start + VISIBLE);
  const canPage = pageCount > 1;
  const centerIdx = shown.length === VISIBLE ? 1 : -1; // only elevate the middle one at full capacity

  return (
    <div className="book-pedestal-showcase">
      <div className="book-pedestal-showcase__stage">
        {canPage && (
          <button
            type="button"
            className="book-pedestal-showcase__nav book-pedestal-showcase__nav--prev"
            onClick={() => setPage((p) => (p - 1 + pageCount) % pageCount)}
            aria-label="الإصدارات السابقة"
          >
            <ChevronRight size={18} />
          </button>
        )}

        <div className="book-pedestal-showcase__pedestals" data-count={shown.length}>
          {shown.map((slide, i) => {
            const card = (
              <>
                <span className="book-pedestal-showcase__platform" aria-hidden="true" />
                <img src={slide.image_url} alt={slide.title ?? ''} loading="lazy" />
              </>
            );
            const className = `book-pedestal-showcase__pedestal${i === centerIdx ? ' book-pedestal-showcase__pedestal--center' : ''}`;
            return slide.link_url ? (
              <Link to={slide.link_url} className={className} key={slide.id}>
                {card}
              </Link>
            ) : (
              <div className={className} key={slide.id}>
                {card}
              </div>
            );
          })}
        </div>

        {canPage && (
          <button
            type="button"
            className="book-pedestal-showcase__nav book-pedestal-showcase__nav--next"
            onClick={() => setPage((p) => (p + 1) % pageCount)}
            aria-label="الإصدارات التالية"
          >
            <ChevronLeft size={18} />
          </button>
        )}
      </div>

      {canPage && (
        <div className="book-pedestal-showcase__dots" role="tablist" aria-label="صفحات العرض">
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === page}
              aria-label={`الصفحة ${i + 1}`}
              className={`book-pedestal-showcase__dot${i === page ? ' book-pedestal-showcase__dot--active' : ''}`}
              onClick={() => setPage(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
