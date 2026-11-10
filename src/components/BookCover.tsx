/* ────────────────────────────────────────────────────────────
   BookCover — the picture of a book. When a real cover_url
   exists it renders that; a book without one gets the house
   cover instead: white, the company's lockup in the middle,
   a band of the brand pattern at the top and another at the
   bottom, so an unpictured book still looks like it belongs.
   ──────────────────────────────────────────────────────────── */

type BookCoverProps = {
  title: string;
  /** Kept for callers; the house cover carries no per-book text (the card shows it). */
  author?: string | null;
  coverUrl?: string | null;
  /** Thumbnails (search results): the mark alone, no pattern bands */
  thumbnail?: boolean;
  /** Kept for callers that pass it (denser cards); the house cover is the same size of drawing either way. */
  compact?: boolean;
};

export default function BookCover({ title, coverUrl, thumbnail = false }: BookCoverProps) {
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

  return (
    <div
      className={`book-cover__gen book-cover__blank${thumbnail ? ' book-cover__blank--thumb' : ''}`}
      role="img"
      aria-label={title}
    >
      <span className="book-cover__band book-cover__band--top" aria-hidden="true" />
      <img
        className="book-cover__logo"
        src={thumbnail ? '/branding/logo-mark.svg' : '/branding/logo-full.svg'}
        alt=""
        draggable={false}
      />
      <span className="book-cover__band book-cover__band--bottom" aria-hidden="true" />
    </div>
  );
}
