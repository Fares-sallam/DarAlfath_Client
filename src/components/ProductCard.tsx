import { Heart } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWishlist } from '@/contexts/WishlistContext';
import { formatCatalogPrice } from '@/hooks/useStorefront';
import type { ProductItem } from '@/types/store';

export default function ProductCard({
  product,
  compact = false,
}: {
  product: ProductItem;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [imageFailed, setImageFailed] = useState(false);

  const wished = isInWishlist(product.id);
  const variantLabel =
    product.variant_count > 1 ? `${product.variant_count} نسخ` : 'نسخة واحدة';
  const categoryLabel = product.category_name || product.category?.name || product.type;
  const coverUrl = product.cover_url && !imageFailed ? product.cover_url : null;

  const discountPct =
    product.compare_at_price && product.compare_at_price > product.min_price
      ? Math.round((1 - product.min_price / product.compare_at_price) * 100)
      : 0;

  const openBook = () => navigate(`/book/${product.id}`);

  return (
    <article
      className={compact ? 'book-card book-card--compact' : 'book-card'}
      onClick={openBook}
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
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={product.title}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="book-card__cover-fallback">
            <img src="/branding/dar-alfath-logo.jpeg" alt="دار الفتح" />
            <span>دار الفتح</span>
          </div>
        )}

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
