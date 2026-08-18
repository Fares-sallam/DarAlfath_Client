import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useHomeHeroSlides } from '@/hooks/useStorefront';

/**
 * The homepage hero's focal content: an admin-uploaded banner image (or a
 * rotation of a few), replacing the old all-text title panel. Renders
 * inside Frontispiece's frame (ornaments, wall texture, glow all still
 * apply — only what fills .frontispiece__inner has changed).
 *
 * Each slide is shown at its own natural width — full-bleed inside the
 * frame, no cropping into a fixed box — because slides are meant to be
 * ready-made banner graphics the admin designs elsewhere (Canva, etc.)
 * and uploads as-is, not raw book-cover photos this component composes
 * itself. One slide shows plainly; more than one adds arrows + dots to
 * page between them, one at a time.
 *
 * Slides come from home_hero_slides (see useHomeHeroSlides), fully
 * independent of the products table so the dashboard can curate this
 * before the catalog itself is ready. Zero slides is a real, expected
 * state pre-launch — the stage just doesn't render, no placeholder box.
 */
export default function HeroShowcase() {
  const { data: slides = [] } = useHomeHeroSlides();
  const [index, setIndex] = useState(0);

  if (slides.length === 0) return null;

  const canPage = slides.length > 1;
  const slide = slides[index % slides.length];

  const banner = (
    <img
      className="home-hero-panel__img"
      src={slide.image_url}
      alt={slide.title ?? ''}
      loading="lazy"
    />
  );

  return (
    <div className="home-hero-panel">
      <div className="home-hero-panel__stage">
        {canPage && (
          <button
            type="button"
            className="home-hero-panel__nav home-hero-panel__nav--prev"
            onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
            aria-label="الإصدار السابق"
          >
            <ChevronRight size={18} />
          </button>
        )}

        {slide.link_url ? (
          <Link to={slide.link_url} className="home-hero-panel__frame">
            {banner}
          </Link>
        ) : (
          <div className="home-hero-panel__frame">{banner}</div>
        )}

        {canPage && (
          <button
            type="button"
            className="home-hero-panel__nav home-hero-panel__nav--next"
            onClick={() => setIndex((i) => (i + 1) % slides.length)}
            aria-label="الإصدار التالي"
          >
            <ChevronLeft size={18} />
          </button>
        )}
      </div>

      {canPage && (
        <div className="home-hero-panel__dots" role="tablist" aria-label="صور الواجهة">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`الصورة ${i + 1}`}
              className={`home-hero-panel__dot${i === index ? ' home-hero-panel__dot--active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
