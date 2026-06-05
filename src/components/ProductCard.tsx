import { Heart } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWishlist } from '@/contexts/WishlistContext';
import { formatCatalogPrice } from '@/hooks/useStorefront';
import type { ProductItem } from '@/types/store';
import BookCover from '@/components/BookCover';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function ProductCard({
  product,
  compact = false,
  index = 0,
  featured = false,
}: {
  product: ProductItem;
  compact?: boolean;
  index?: number;
  featured?: boolean;
}) {
  const navigate = useNavigate();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const cardRef = useRef<HTMLElement | null>(null);
  const rafId = useRef(0);

  const wished = isInWishlist(product.id);
  const variantLabel =
    product.variant_count > 1 ? `${product.variant_count} نسخ` : 'نسخة واحدة';
  const categoryLabel = product.category_name || product.category?.name || product.type;

  const discountPct = product.discount_percent && product.discount_percent > 0
    ? Math.round(product.discount_percent)
    : 0;

  const openBook = () => navigate(`/book/${product.id}`);

  // ── 3D tilt: write --rx/--ry onto the cover element directly ──
  // (Setting them on the card and relying on custom-property inheritance
  //  proved unreliable; targeting the cover that owns the transform is robust.)
  const onMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = cardRef.current;
    if (!el || featured || prefersReducedMotion()) return;
    const cover = el.querySelector<HTMLElement>('.book-card__cover');
    if (!cover) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;   // 0…1
      const y = (clientY - rect.top) / rect.height;
      cover.style.setProperty('--ry', `${(x - 0.5) * 16}deg`);  // max ±8°
      cover.style.setProperty('--rx', `${(y - 0.5) * -12}deg`); // max ±6°
    });
  }, [featured]);

  const onLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const cover = el.querySelector<HTMLElement>('.book-card__cover');
    cancelAnimationFrame(rafId.current);
    cover?.style.setProperty('--ry', '0deg');
    cover?.style.setProperty('--rx', '0deg');
  }, []);

  const className =
    (compact ? 'book-card book-card--compact' : 'book-card') +
    (featured ? ' book-card--featured' : '');

  return (
    <article
      ref={cardRef}
      className={className}
      style={{ '--i': index } as React.CSSProperties}
      onClick={openBook}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openBook();
        }
      }}
      aria-label={`فتح صفحة ${product.title}`}
    >
      <button
        type="button"
        className={`book-card__fav ${wished ? 'book-card__fav--active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          toggleWishlist(product.id);
        }}
        aria-label={wished ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
      >
        <Heart size={15} fill={wished ? 'currentColor' : 'none'} />
      </button>

      <div className="book-card__cover">
        <BookCover
          title={product.title}
          author={product.author}
          coverUrl={product.cover_url}
          compact={compact}
        />

        {discountPct > 0 ? (
          <span className="book-card__discount-badge" aria-label={`خصم ${discountPct}%`}>
            {discountPct}%
          </span>
        ) : null}
      </div>

      <div className="book-card__body">
        <div className="book-card__topline">
          <div className="book-card__badges">
            <span>{product.type || 'كتاب'}</span>
          </div>

          {categoryLabel ? (
            <small className="book-card__series">{categoryLabel}</small>
          ) : null}
        </div>

        <h3 title={product.title}>{product.title}</h3>
        <p title={product.author}>{product.author}</p>

        <div className="book-card__rating">
          <span>{product.rating}</span>
          <span className="stars">★★★★★</span>
          <small className="book-card__variants-count">{variantLabel}</small>
        </div>

        <div className="book-card__price">
          <strong>{formatCatalogPrice(product)}</strong>
        </div>

        <div className="book-card__actions">
          <button
            type="button"
            className="primary-button"
            onClick={(e) => {
              e.stopPropagation();
              openBook();
            }}
          >
            عرض التفاصيل
          </button>
        </div>
      </div>
    </article>
  );
}
