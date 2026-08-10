import { useEffect, useRef } from 'react';

/**
 * Reveals a section once as it scrolls into view.
 *
 * Adds a class rather than animating from JS so the motion stays on the
 * compositor, and unobserves after the first reveal so scrolling back up
 * doesn't replay it. Under `prefers-reduced-motion` the element is shown
 * immediately and no observer is created at all.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-revealed');
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}
