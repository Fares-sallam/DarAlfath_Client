import { useCallback, useEffect, useRef } from 'react';

/**
 * Writes the pointer position onto an element as `--mx` / `--my`, plus a
 * `--glow` gate that fades the effect in and out with the pointer.
 *
 * Shared by anything that wants light to follow the cursor. Updates happen
 * inside a rAF and touch only custom properties, so nothing re-renders and
 * the paint stays off the main thread. Skipped entirely on touch and under
 * reduced-motion, where the CSS also hides the layer.
 */
export function useCursorLight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const rafId = useRef(0);

  const write = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((clientY - r.top) / r.height) * 100}%`);
      el.style.setProperty('--glow', '1');
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const coarse = window.matchMedia?.('(hover: none)').matches;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (coarse || reduced) return;

    // Listens on `window`, not the element: the glow layer itself is
    // `pointer-events: none` (by design — it must never intercept clicks),
    // which means it would never receive its own mouse events. Position is
    // still computed against the element's own rect in `write`, so this
    // works whether the element is a small boxed panel or a full-viewport
    // fixed overlay.
    const onMove = (e: MouseEvent) => write(e.clientX, e.clientY);
    const onLeave = () => {
      cancelAnimationFrame(rafId.current);
      el.style.setProperty('--glow', '0');
    };

    window.addEventListener('mousemove', onMove);
    // `mouseleave` on window isn't reliably supported; document is.
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(rafId.current);
    };
  }, [write]);

  return ref;
}
