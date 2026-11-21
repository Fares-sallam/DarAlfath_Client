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
 *
 * `drag`: with a mouse the strip can also be grabbed and pulled sideways (a touch screen already swipes it);
 * a pull is not a click, so the card under the pointer is not opened when it ends.
 */
export default function ScrollRail({
  children,
  ariaLabel,
  className = '',
  drag = false,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  className?: string;
  drag?: boolean;
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

  // Pulling the strip with a mouse. scrollLeft moves the same way in both text directions: it is the
  // position of the view, so dragging the content right means the view goes left (a smaller scrollLeft).
  const pull = useRef<{ x: number; from: number; moved: boolean } | null>(null);
  const [pulling, setPulling] = useState(false);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerType !== 'mouse' || event.button !== 0 || !railRef.current) return;
    pull.current = { x: event.clientX, from: railRef.current.scrollLeft, moved: false };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pull.current;
    const el = railRef.current;
    if (!state || !el) return;
    const dx = event.clientX - state.x;
    if (!state.moved) {
      if (Math.abs(dx) < 6) return;
      state.moved = true;
      setPulling(true);
      el.setPointerCapture?.(event.pointerId);
    }
    el.scrollLeft = state.from - dx;
  };
  const endPull = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pull.current;
    pull.current = null;
    if (!state?.moved) return;
    railRef.current?.releasePointerCapture?.(event.pointerId);
    setPulling(false);
    // the click that follows the release belongs to the pull, not to the card under the pointer
    const swallow = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 60);
  };

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

      <div
        className={`scroll-rail__track${drag ? ' scroll-rail__track--drag' : ''}${pulling ? ' scroll-rail__track--pulling' : ''}`}
        ref={railRef}
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerDown={drag ? onPointerDown : undefined}
        onPointerMove={drag ? onPointerMove : undefined}
        onPointerUp={drag ? endPull : undefined}
        onPointerCancel={drag ? endPull : undefined}
        onDragStart={drag ? (event) => event.preventDefault() : undefined}
      >
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
