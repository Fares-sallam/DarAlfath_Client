/**
 * Section ornaments, drawn as SVG so they stay crisp at any size and take
 * the theme's colours instead of shipping baked-in ones.
 *
 * `divider` is the section separator: one unit of the house pattern (four
 * crescents meeting at a point, from the brand files) on a hairline rule.
 * `corner` is the frame flourish used at the hero's four corners.
 */
export function OrnamentDivider({ label }: { label?: string }) {
  return (
    <div className="ornament-divider" role="separator" aria-label={label ?? 'فاصل'}>
      <span className="ornament-divider__rule" />
      <svg className="ornament-divider__mark" viewBox="10 0 61 68" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M 14.25 1.5 L 27.47 1.5 C 27.47 1.5 21.66 19.94 39.74 34.1 C 39.74 34.1 11.01 27.72 14.25 1.5 Z" />
        <path className="ornament-divider__accent" d="M 66.55 1.5 L 53.33 1.5 C 53.33 1.5 59.14 19.94 41.06 34.1 C 41.06 34.1 69.79 27.72 66.55 1.5 Z" />
        <path fill="currentColor" d="M 65.55 66.7 L 52.33 66.7 C 52.33 66.7 58.15 48.26 40.06 34.1 C 45.25 35.25 68.94 39.33 65.55 66.7 Z" />
        <path fill="currentColor" d="M 14.25 66.7 L 27.47 66.7 C 27.47 66.7 21.66 48.26 39.74 34.1 C 39.74 34.1 11.01 40.48 14.25 66.7 Z" />
      </svg>
      <span className="ornament-divider__rule" />
    </div>
  );
}

export function OrnamentCorner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <svg
      className={`ornament-corner ornament-corner--${position}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M2 22V8a6 6 0 0 1 6-6h14" />
        <path d="M2 34V12a4 4 0 0 1 4-4h22" opacity="0.55" />
        <path d="M14 2c0 7 5 12 12 12" opacity="0.7" />
        <circle cx="9" cy="9" r="1.6" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

/**
 * A headpiece medallion — the illuminated roundel manuscripts open a page
 * with. Sits centered above the eyebrow, the frame's one vertical accent.
 *
 * The house emblem ships as a square with its own blue field, which would
 * read as a pasted sticker on the cream surface. Clipped to a disc inside a
 * gold ring, that blue becomes the medallion's own ground instead — and the
 * same disc sits naturally on the navy surface too. The art is inset well
 * past the ring because the source file carries wide empty margins.
 */
export function OrnamentMedallion() {
  return (
    <span className="ornament-medallion" aria-hidden="true">
      <img
        className="ornament-medallion__art"
        src="/branding/dar-alfath-emblem.png"
        alt=""
        draggable={false}
      />
    </span>
  );
}

/**
 * Margin ticks — the small diamond-on-a-stem mark manuscript copyists set
 * in the blank gutter to break up the empty margin. One per inner edge.
 */
export function OrnamentSideMark({ side }: { side: 'start' | 'end' }) {
  return (
    <svg
      className={`ornament-sidemark ornament-sidemark--${side}`}
      viewBox="0 0 16 120"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
        <path d="M8 6v36" opacity="0.55" />
        <path d="M8 78v36" opacity="0.55" />
        <rect x="2.5" y="51" width="11" height="11" transform="rotate(45 8 56.5)" />
        <circle cx="8" cy="56.5" r="1.4" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}
