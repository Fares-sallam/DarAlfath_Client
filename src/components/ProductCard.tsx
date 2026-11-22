import { Heart, Share2, Star } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWishlist } from '@/contexts/WishlistContext';
import { catalogPriceParts } from '@/hooks/useStorefront';
import { useBookStock } from '@/hooks/useBookStock';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import { discountText, isLowStock, isNewBook } from '@/lib/displaySettings';
import { editionsLabel } from '@/lib/editions';
import { shareBook } from '@/lib/share';
import type { ProductItem } from '@/types/store';
import BookCover from '@/components/BookCover';
import CardBuyActions from '@/components/CardBuyActions';

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
  const coverRef = useRef<HTMLDivElement | null>(null);
  const rafId = useRef(0);

  const display = useDisplaySettings();
  const show = display.card.show;
  const wished = isInWishlist(product.id);
  const variantLabel = editionsLabel(product.variant_count);
  const price = catalogPriceParts(product);
  const categoryLabel = product.category_name || product.category?.name || product.type;

  const discountPct = product.discount_percent && product.discount_percent > 0
    ? Math.round(product.discount_percent)
    : 0;
  // what the card says is saved: the price before the discount less the price it is sold at (shown as «وفّر 30 ج.م» when chosen)
  const saved = product.compare_at_price ? product.compare_at_price - (product.min_price || product.starting_price) : null;
  const flagNew = show.isNew.web && isNewBook(product.created_at, display.card.newDays);
  const { data: stockOfBooks } = useBookStock(show.lowStock.web);
  const stockLeft = stockOfBooks?.get(product.product_id) ?? null;
  const flagLow = show.lowStock.web && isLowStock(stockLeft, display.card.lowStockAt);

  const openBook = () => navigate(`/book/${product.id}`);

  // ── 3D tilt: write --rx/--ry onto the cover element directly ──
  // (Setting them on the card and relying on custom-property inheritance
  //  proved unreliable; targeting the cover that owns the transform is robust.)
  // The picture inside the frame follows the pointer too (--mx/--my, -1 … 1 across the frame): it is
  // grown a little on hover (see styles-home.css) and slid the other way, as a zoom you pan with the mouse.
  const onMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = cardRef.current;
    if (!el || featured || !display.card.tilt || prefersReducedMotion()) return;
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
      const frame = cover.getBoundingClientRect();
      const clamp = (n: number) => Math.max(-1, Math.min(1, n));
      cover.style.setProperty('--mx', clamp(((clientX - frame.left) / frame.width - 0.5) * 2).toFixed(3));
      cover.style.setProperty('--my', clamp(((clientY - frame.top) / frame.height - 0.5) * 2).toFixed(3));
    });
  }, [featured, display.card.tilt]);

  const onLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const cover = el.querySelector<HTMLElement>('.book-card__cover');
    cancelAnimationFrame(rafId.current);
    cover?.style.setProperty('--ry', '0deg');
    cover?.style.setProperty('--rx', '0deg');
    cover?.style.setProperty('--mx', '0');
    cover?.style.setProperty('--my', '0');
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
      {show.wishlist.web ? (
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
      ) : null}

      {show.share.web ? (
        <button
          type="button"
          className="book-card__share"
          onClick={(e) => {
            e.stopPropagation();
            void shareBook({ id: product.id, title: product.title });
          }}
          aria-label={`مشاركة رابط ${product.title}`}
        >
          <Share2 size={15} />
        </button>
      ) : null}

      <div className="book-card__cover" ref={coverRef}>
        <BookCover
          title={product.title}
          author={product.author}
          coverUrl={product.cover_url}
          compact={compact}
        />

        {discountPct > 0 && show.discount.web ? (
          <span className="book-card__discount-badge" aria-label={`خصم ${discountPct}%`} data-testid="card-discount">
            {discountText(display.card.discountStyle, discountPct, saved, product.currency_symbol)}
          </span>
        ) : null}

        {flagNew || flagLow ? (
          <div className="book-card__flags">
            {flagNew ? <span className="book-card__flag" data-testid="card-flag-new">جديد</span> : null}
            {flagLow ? <span className="book-card__flag book-card__flag--low" data-testid="card-flag-low">آخر {Number(stockLeft).toLocaleString('ar-EG')} {stockLeft === 1 ? 'نسخة' : 'نسخ'}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="book-card__body">
        {show.type.web || show.category.web ? (
          <div className="book-card__topline">
            <div className="book-card__badges">
              {show.type.web ? <span>{product.is_bundle ? 'مجموعة' : product.type || 'كتاب'}</span> : null}
            </div>

            {show.category.web && categoryLabel ? (
              <small className="book-card__series">{categoryLabel}</small>
            ) : null}
          </div>
        ) : null}

        <h3 title={product.title}>{product.title}</h3>
        <p title={product.author}>{product.author}</p>

        {show.rating.web || (show.editions.web && variantLabel) ? (
          <div className="book-card__rating">
            {show.rating.web ? (
              product.rating != null ? (
                <>
                  <span>{product.rating}</span>
                  <span className="stars">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} size={11} fill={i <= Math.round(product.rating!) ? 'currentColor' : 'none'} />
                    ))}
                  </span>
                </>
              ) : (
                <span className="book-card__no-rating">لا يوجد تقييم بعد</span>
              )
            ) : null}
            {show.editions.web && variantLabel ? <small className="book-card__variants-count">{variantLabel}</small> : null}
          </div>
        ) : null}

        <div className="book-card__price">
          {price.prefix ? <small className="book-card__from">{price.prefix}</small> : null}
          {price.was ? <del className="price-was">{price.was}</del> : null}
          <strong>{price.now}</strong>
        </div>

        <CardBuyActions product={product} coverRef={coverRef} onOpen={openBook} />
      </div>
    </article>
  );
}
