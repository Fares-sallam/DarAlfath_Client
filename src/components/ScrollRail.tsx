import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Horizontal scroller for anything that comes in a row: book cards on the
 * homepage now, and the per-book image galleries once products carry more
 * than one image.
 *
 * Native scroll (not a JS-driven carousel) so touch, trackpad, keyboard and
 * screen readers all behave the way the platform already does; the arrows are
 * an addition on top of that, shown only when there is somewhere to go and
 * only on pointer devices where a drag isn't natural.
 */
export default function ScrollRail({
  children,
  ariaLabel,
  className = '',
}: {
  children: React.ReactNode;
  ariaLabel: string;
  className?: string;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  // RTL: scrollLeft runs negative from 0 at the right edge in Chrome/Firefox,
  // so compare on absolute distance rather than sign.
  const sync = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setAtStart(pos <= 1);
    setAtEnd(max <= 1 || pos >= max - 1);
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', sync);
      ro.disconnect();
    };
  }, [sync, children]);

  const nudge = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({
      left: dir * Math.max(240, el.clientWidth * 0.8),
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  const hideAll = atStart && atEnd; // nothing overflows: no arrows at all

  return (
    <div className={`scroll-rail ${className}`.trim()}>
      {!hideAll && (
        <button
          type="button"
          className="scroll-rail__arrow scroll-rail__arrow--prev"
          onClick={() => nudge(1)}
          disabled={atStart}
          aria-label="السابق"
          tabIndex={-1}
        >
          <ChevronRight size={18} />
        </button>
      )}

      <div className="scroll-rail__track" ref={railRef} role="group" aria-label={ariaLabel} tabIndex={0}>
        {children}
      </div>

      {!hideAll && (
        <button
          type="button"
          className="scroll-rail__arrow scroll-rail__arrow--next"
          onClick={() => nudge(-1)}
          disabled={atEnd}
          aria-label="التالي"
          tabIndex={-1}
        >
          <ChevronLeft size={18} />
        </button>
      )}
    </div>
  );
}
