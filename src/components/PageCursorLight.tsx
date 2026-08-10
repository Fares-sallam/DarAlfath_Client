import { useCursorLight } from '@/hooks/useCursorLight';

/**
 * The frontispiece's cursor light, extended to the whole page: one soft light
 * that follows the pointer across every section, not just the title panel.
 *
 * Fixed to the viewport (not the scrolling content) and blended over
 * everything below it, so it reads through the frontispiece's opaque frame,
 * the shelf cards, and the plain page background alike — a single light
 * source for the page rather than a box that happens to glow. `pointer-events:
 * none` keeps it fully out of the way of clicks and scroll.
 */
export default function PageCursorLight() {
  const ref = useCursorLight<HTMLDivElement>();
  return <div className="page-cursor-light" ref={ref} aria-hidden="true" />;
}
