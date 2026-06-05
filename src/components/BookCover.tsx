/* ────────────────────────────────────────────────────────────
   BookCover — generated 2:3 cover for books without artwork.
   Navy field, gold spine, geometric motif, title + author.
   Deterministic per-title variation so no two books look alike.
   When a real cover_url exists, it renders that instead.
   ──────────────────────────────────────────────────────────── */

type BookCoverProps = {
  title: string;
  author?: string | null;
  coverUrl?: string | null;
  /** Smaller type + spine for compact grids */
  compact?: boolean;
};

// Cheap, stable string hash → used to vary motif + hue per book.
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export default function BookCover({ title, author, coverUrl, compact = false }: BookCoverProps) {
  if (coverUrl) {
    return (
      <img
        className="book-cover__img"
        src={coverUrl}
        alt={title}
        loading="lazy"
      />
    );
  }

  const seed = hashString(title || 'دار الفتح');
  // Navy hue drift: keep within a tight, on-brand band (deep blue → indigo).
  const hue = 222 + (seed % 26);            // 222…247
  const motif = seed % 4;                    // 0…3 geometric variants
  const rotate = (seed % 7) * 8;             // motif rotation

  const style = {
    '--cover-hue': hue,
    '--cover-rotate': `${rotate}deg`,
  } as React.CSSProperties;

  return (
    <div
      className={`book-cover__gen book-cover__gen--m${motif} ${compact ? 'book-cover__gen--compact' : ''}`}
      style={style}
      aria-label={title}
    >
      <span className="book-cover__spine" aria-hidden="true" />
      <span className="book-cover__motif" aria-hidden="true" />
      <span className="book-cover__sheen" aria-hidden="true" />

      <div className="book-cover__plate">
        <span className="book-cover__kicker" aria-hidden="true">دار الفتح</span>
        <h4 className="book-cover__title">{title}</h4>
        {author ? <span className="book-cover__author">{author}</span> : null}
      </div>
    </div>
  );
}
