import { useCallback, useEffect, useRef } from 'react';

/**
 * The homepage title panel.
 *
 * Carries two ambient effects that only exist on pointer devices:
 *  - a watermark of the house emblem, barely there, to give the cream/navy
 *    field something to be rather than empty space;
 *  - a soft light that tracks the cursor across the panel — it brightens on
 *    the dark theme and deepens on the light one, since a glow is invisible
 *    on cream.
 *
 * Position is written to CSS custom properties inside a rAF, so the paint
 * stays on the compositor and React never re-renders on mousemove.
 */
export default function Frontispiece({ children }: { children: React.ReactNode }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const rafId = useRef(0);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = frameRef.current;
    if (!el) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((clientY - r.top) / r.height) * 100}%`);
      el.style.setProperty('--glow', '1');
    });
  }, []);

  const onLeave = useCallback(() => {
    const el = frameRef.current;
    cancelAnimationFrame(rafId.current);
    el?.style.setProperty('--glow', '0');
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafId.current), []);

  return (
    <section className="frontispiece">
      <div
        className="frontispiece__frame"
        ref={frameRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <img
          className="frontispiece__watermark"
          src="/branding/dar-alfath-logo.jpeg"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <span className="frontispiece__glow" aria-hidden="true" />
        {children}
      </div>
    </section>
  );
}
