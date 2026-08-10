/**
 * Manuscript-style gold ornaments, drawn as SVG so they stay crisp at any size
 * and pick up the theme's own gold rather than shipping a baked-in colour.
 *
 * `divider` is the section separator: a centred rosette on a hairline rule.
 * `corner` is the frame flourish used at the hero's four corners.
 */
export function OrnamentDivider({ label }: { label?: string }) {
  return (
    <div className="ornament-divider" role="separator" aria-label={label ?? 'فاصل'}>
      <span className="ornament-divider__rule" />
      <svg className="ornament-divider__mark" viewBox="0 0 48 24" aria-hidden="true" focusable="false">
        {/* eight-point rosette: two squares at 45° — the base motif of the
            geometric star patterns in Mamluk manuscript headpieces */}
        <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
          <rect x="17" y="5" width="14" height="14" />
          <rect x="17" y="5" width="14" height="14" transform="rotate(45 24 12)" />
          <circle cx="24" cy="12" r="2.1" fill="currentColor" stroke="none" />
          <path d="M6 12h7M35 12h7" strokeLinecap="round" />
          <circle cx="3.2" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="44.8" cy="12" r="1.3" fill="currentColor" stroke="none" />
        </g>
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
 */
export function OrnamentMedallion() {
  return (
    <svg className="ornament-medallion" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinejoin="round">
        <circle cx="32" cy="32" r="22" strokeWidth="1" opacity="0.5" />
        <rect x="21" y="21" width="22" height="22" strokeWidth="1.1" />
        <rect x="21" y="21" width="22" height="22" strokeWidth="1.1" transform="rotate(45 32 32)" />
        <circle cx="32" cy="32" r="3" fill="currentColor" stroke="none" />
        <g strokeWidth="1" strokeLinecap="round" opacity="0.65">
          <path d="M32 4v8M32 52v8M4 32h8M52 32h8" />
        </g>
        <g fill="currentColor" stroke="none" opacity="0.8">
          <circle cx="32" cy="8" r="1.2" />
          <circle cx="32" cy="56" r="1.2" />
          <circle cx="8" cy="32" r="1.2" />
          <circle cx="56" cy="32" r="1.2" />
        </g>
      </g>
    </svg>
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
