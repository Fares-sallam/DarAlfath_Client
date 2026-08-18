import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useHomeHeroSlides } from '@/hooks/useStorefront';

const AUTO_ADVANCE_MS = 10000;
const FADE_MS = 420;

/**
 * The homepage's entire hero: an admin-uploaded banner image (or a
 * rotation of a few), on its own — no frame, no logo, no title, no lede
 * text around it. What used to be a framed title panel with the banner
 * as one element inside it is gone; the banner itself is now the hero,
 * rendered directly by HomePage inside a plain .container.
 *
 * Each slide is its own natural width, no card/shadow wrapper around it —
 * the banner graphics the admin uploads already carry their own framing.
 * With more than one slide, it auto-advances every 10s with a cross-fade
 * (paused on hover), plus arrows and dots for manual control.
 *
 * Slides come from home_hero_slides (see useHomeHeroSlides), fully
 * independent of the products table so the dashboard can curate this
 * before the catalog itself is ready. Zero slides is a real, expected
 * state pre-launch — the stage just doesn't render, no placeholder box.
 */
export default function HeroShowcase() {
  const { data: slides = [] } = useHomeHeroSlides();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>();

  const count = slides.length;

  const goTo = (next: number) => {
    setVisible(false);
    clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      setIndex(next);
      setVisible(true);
    }, FADE_MS);
  };

  useEffect(() => () => clearTimeout(fadeTimer.current), []);

  // Resets on every index change (manual or automatic) so a slide the
  // visitor just navigated to always gets its own full 10s on screen.
  useEffect(() => {
    if (count < 2 || paused) return;
    const id = setTimeout(() => goTo((index + 1) % count), AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, paused, index]);

  if (count === 0) return null;

  const slide = slides[index];
  // No `key` here on purpose: this must stay the same DOM node across
  // slide changes so the opacity transition below can animate smoothly
  // in *both* directions — fading the old src out, then the new one in —
  // instead of the incoming image just popping in on a freshly-mounted node.
  // <picture> is just a source-picking wrapper; the transition/animation
  // classes stay on the <img>, since that's the element they target.
  const img = (
    <picture>
      {slide.image_url_mobile && (
        <source media="(max-width: 640px)" srcSet={slide.image_url_mobile} />
      )}
      <img
        className={`home-hero-panel__img${visible ? '' : ' home-hero-panel__img--fading'}`}
        src={slide.image_url}
        alt={slide.title ?? ''}
        loading="eager"
      />
    </picture>
  );

  return (
    <div
      className="home-hero-panel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="home-hero-panel__stage">
        {count > 1 && (
          <button
            type="button"
            className="home-hero-panel__nav home-hero-panel__nav--prev"
            onClick={() => goTo((index - 1 + count) % count)}
            aria-label="الصورة السابقة"
          >
            <ChevronRight size={18} />
          </button>
        )}

        {slide.link_url ? (
          <Link to={slide.link_url} className="home-hero-panel__viewport">
            {img}
          </Link>
        ) : (
          <div className="home-hero-panel__viewport">{img}</div>
        )}

        {count > 1 && (
          <button
            type="button"
            className="home-hero-panel__nav home-hero-panel__nav--next"
            onClick={() => goTo((index + 1) % count)}
            aria-label="الصورة التالية"
          >
            <ChevronLeft size={18} />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="home-hero-panel__dots" role="tablist" aria-label="صور الواجهة">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`الصورة ${i + 1}`}
              className={`home-hero-panel__dot${i === index ? ' home-hero-panel__dot--active' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
