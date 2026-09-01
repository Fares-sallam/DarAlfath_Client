import { Heart, ShoppingBag, Sparkles, ShieldCheck, Truck, BookOpenText, X, Star, Tag, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProductCard from '@/components/ProductCard';
import ProductReviews from '@/components/ProductReviews';
import QuantitySelector from '@/components/QuantitySelector';
import {
  formatCatalogPrice,
  formatMoney,
  useProductDetails,
  useProductImageGallery,
  useProductVariants,
  useRelatedProducts,
} from '@/hooks/useStorefront';
import { useWishlist } from '@/contexts/WishlistContext';
import { useCart } from '@/contexts/CartContext';
import { flyToCart } from '@/lib/flyToCart';
import BookCover from '@/components/BookCover';
import ScrollRail from '@/components/ScrollRail';
import type { ProductVariantItem } from '@/types/store';

type DetailsTab = 'about' | 'specs' | 'reviews';

/* ────────────────────────────────────────────────────────────
   3D Book tilt — tracks mouse position over the gallery area
   and applies a CSS perspective rotation for a tactile feel.
   ──────────────────────────────────────────────────────────── */
function useBookTilt(ref: React.RefObject<HTMLElement | null>) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const rafId = useRef(0);

  const onMove = useCallback((e: MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;  // 0…1
      const y = (e.clientY - rect.top) / rect.height;
      const rotateY = (x - 0.5) * -14;   // max ±7°
      const rotateX = (y - 0.5) * 10;    // max ±5°
      setStyle({
        transform: `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02,1.02,1.02)`,
      });
    });
  }, [ref]);

  const onLeave = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    setStyle({ transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)' });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(rafId.current);
    };
  }, [ref, onMove, onLeave]);

  return style;
}

/* ────────────────────────────────────────────────────────────
   Page component
   ──────────────────────────────────────────────────────────── */
export default function BookDetailsPage() {
  const { productId } = useParams();
  const { data: product, isLoading } = useProductDetails(productId);
  const { data: variants = [], isLoading: variantsLoading } = useProductVariants(
    product?.product_id ?? productId
  );
  const { data: related = [] } = useRelatedProducts(
    product?.category_slug,
    product?.product_id
  );
  const { data: galleryImages = [] } = useProductImageGallery(
    product?.product_id ?? productId
  );

  const { isInWishlist, toggleWishlist } = useWishlist();
  const { addToCart } = useCart();

  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<DetailsTab>('about');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);

  const bookRef = useRef<HTMLDivElement>(null);
  const tiltStyle = useBookTilt(bookRef);

  const displayedImages = useMemo(() => {
    if (!product) return [];
    if (galleryImages.length > 0) return galleryImages;
    return product.images?.length
      ? product.images
      : ([product.cover_url].filter(Boolean) as string[]);
  }, [product, galleryImages]);

  const selectedVariant = useMemo<ProductVariantItem | null>(() => {
    return variants.find((item) => item.variant_id === selectedVariantId) ?? null;
  }, [variants, selectedVariantId]);

  useEffect(() => {
    setSelectedImage(displayedImages[0] ?? null);
    setLightboxImage(null);
  }, [displayedImages, product?.product_id]);

  useEffect(() => { setQuantity(1); }, [selectedVariantId]);

  // Lightbox keyboard: Escape closes, arrows walk the gallery. RTL keeps the
  // physical key meaning (Left = next in reading order) so it matches the
  // on-screen arrow placement.
  useEffect(() => {
    if (!lightboxImage) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLightboxImage(null); return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const idx = displayedImages.indexOf(lightboxImage);
      if (idx === -1 || displayedImages.length < 2) return;
      const step = e.key === 'ArrowLeft' ? 1 : -1;
      const next = (idx + step + displayedImages.length) % displayedImages.length;
      setLightboxImage(displayedImages[next]);
      setSelectedImage(displayedImages[next]);
    };
    window.addEventListener('keydown', onKeyDown);
    // the page behind must not scroll while the overlay owns the viewport
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxImage, displayedImages]);

  const updateQuantity = (value: number) => {
    if (!selectedVariant || selectedVariant.is_digital) { setQuantity(1); return; }
    const max = selectedVariant.available_stock ?? value;
    setQuantity(Math.max(1, Math.min(Math.floor(value || 1), max)));
  };

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    addToCart(product!, selectedVariant, selectedVariant.is_digital ? 1 : quantity);
    flyToCart(bookRef.current);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 1800);
  };

  if (isLoading) return <div className="bk3-loading"><div className="bk3-loading__book" /><div className="bk3-loading__lines"><span /><span /><span /></div></div>;

  if (!product) {
    return (
      <div className="page-card bk-not-found">
        <h1>الكتاب غير موجود</h1>
        <p>قد يكون هذا الكتاب غير متاح في الدولة الحالية أو تم حذفه من العرض.</p>
        <Link to="/books" className="primary-button">العودة للكتب</Link>
      </div>
    );
  }

  const wished = isInWishlist(product.id);
  const categoryLabel = product.category_name || product.category?.name || 'غير محدد';
  const canAddToCart = Boolean(selectedVariant?.is_available);
  const mainImage = selectedImage || product.cover_url || null;
  const descriptionText = product.description ||
    'هذا الإصدار مصمم بعناية ليمنح القارئ تجربة قراءة مريحة، مع عرض واضح ونسخ متعددة تناسب الاستخدامات المختلفة.';

  return (
    <div className="bk3-page">

      {/* ── Breadcrumb ─── */}
      <nav className="bk3-crumbs" style={{ '--i': 0 } as React.CSSProperties}>
        <Link to="/">الرئيسية</Link>
        <span className="bk3-crumbs__sep" />
        <Link to="/books">الكتب</Link>
        {product.category_slug && (
          <>
            <span className="bk3-crumbs__sep" />
            <Link to={`/books?category=${product.category_slug}`}>{categoryLabel}</Link>
          </>
        )}
        <span className="bk3-crumbs__sep" />
        <strong>{product.title}</strong>
      </nav>

      {/* ── Hero section: 3D Book + Info ─── */}
      <section className="bk3-hero">

        {/* 3D Book */}
        <div className="bk3-book-wrap" style={{ '--i': 1 } as React.CSSProperties}>
          <div className="bk3-book-scene" ref={bookRef}>
            {/* Ambient glow */}
            <div className="bk3-glow" />

            <button
              type="button"
              className="bk3-book"
              style={tiltStyle}
              onClick={() => mainImage && setLightboxImage(mainImage)}
              disabled={!mainImage}
            >
              {/* Spine */}
              <div className="bk3-book__spine" />
              {/* Cover */}
              <div className="bk3-book__cover">
                {mainImage ? (
                  <img src={mainImage} alt={product.title} />
                ) : (
                  <BookCover title={product.title} author={product.author} />
                )}
              </div>
              {/* Pages edge */}
              <div className="bk3-book__pages" />
            </button>

            {/* Floating particles */}
            <div className="bk3-particles" aria-hidden="true">
              <span /><span /><span /><span /><span /><span />
            </div>
          </div>

          {/* Thumbnails — scrolls rather than truncating: books carry many
              images, and the old `.slice(0, 5)` silently hid the rest. */}
          {displayedImages.length > 1 && (
            <ScrollRail ariaLabel={`صور ${product.title}`} className="bk3-thumbs-rail">
              {displayedImages.map((img, i) => (
                <button
                  key={img}
                  type="button"
                  className={`bk3-thumb ${img === mainImage ? 'bk3-thumb--on' : ''}`}
                  onClick={() => setSelectedImage(img)}
                  aria-label={`عرض الصورة ${i + 1} من ${displayedImages.length}`}
                  aria-current={img === mainImage}
                >
                  <img src={img} alt="" loading="lazy" />
                </button>
              ))}
            </ScrollRail>
          )}
        </div>

        {/* Info panel */}
        <div className="bk3-info">

          {/* Category + wishlist */}
          <div className="bk3-info__top" style={{ '--i': 2 } as React.CSSProperties}>
            <Link to={`/books?category=${product.category_slug}`} className="bk3-cat">
              <Tag size={11} />
              {categoryLabel}
            </Link>
            <button
              type="button"
              className={`bk3-heart ${wished ? 'bk3-heart--on' : ''}`}
              onClick={() => toggleWishlist(product.id)}
              aria-label={wished ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
            >
              <Heart size={16} fill={wished ? 'currentColor' : 'none'} />
            </button>
          </div>

          {/* Title */}
          <h1 className="bk3-title" style={{ '--i': 3 } as React.CSSProperties}>
            {product.title}
          </h1>

          {/* Author */}
          <p className="bk3-author" style={{ '--i': 4 } as React.CSSProperties}>
            <BookOpenText size={14} />
            {product.author}
          </p>

          {/* Rating — real average from product_reviews, not a fabricated
              number. No reviews yet is a real, expected state: shown as
              a plain prompt instead of a fake star row. */}
          <button
            type="button"
            className="bk3-rating"
            style={{ '--i': 5 } as React.CSSProperties}
            onClick={() => setActiveTab('reviews')}
          >
            {product.rating != null ? (
              <>
                <div className="bk3-stars">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} size={13} fill={i <= Math.round(product.rating!) ? 'currentColor' : 'none'} />
                  ))}
                </div>
                <span className="bk3-rating__val">{product.rating}</span>
                <span className="bk3-rating__lbl">
                  ({product.reviews_count} تقييم)
                </span>
              </>
            ) : (
              <span className="bk3-rating__lbl">كن أول من يقيّم هذا الكتاب</span>
            )}
          </button>

          {/* Price */}
          <div className="bk3-price" style={{ '--i': 6 } as React.CSSProperties}>
            <strong key={selectedVariantId || 'range'}>
              {selectedVariant
                ? formatMoney(selectedVariant.display_price, selectedVariant.currency_symbol)
                : formatCatalogPrice(product)}
            </strong>
            {selectedVariant?.compare_at_price ? (
              <del>{formatMoney(selectedVariant.compare_at_price, selectedVariant.currency_symbol)}</del>
            ) : null}
          </div>

          {/* Description */}
          <p className="bk3-desc" style={{ '--i': 7 } as React.CSSProperties}>{descriptionText}</p>

          {/* ── Variant selector ─── */}
          <div className="bk3-variants" style={{ '--i': 8 } as React.CSSProperties}>
            <div className="bk3-variants__hd">
              <Layers size={14} />
              <span>اختر النسخة</span>
              <small>{variantsLoading ? '...' : `${variants.length || product.variant_count} نسخة`}</small>
            </div>
            <div className="bk3-variants__grid">
              {variants.map((v) => (
                <button
                  key={v.variant_id}
                  type="button"
                  className={`bk3-var ${v.variant_id === selectedVariant?.variant_id ? 'bk3-var--on' : ''}`}
                  onClick={() => setSelectedVariantId(v.variant_id)}
                  disabled={!v.is_available}
                >
                  <span className="bk3-var__name">{v.variant_name}</span>
                  <b className="bk3-var__price">{formatMoney(v.display_price, v.currency_symbol)}</b>
                  <small className="bk3-var__avail">
                    {v.is_digital ? '⚡ رقمي فوري' : v.availability_text || 'غير متوفر'}
                  </small>
                </button>
              ))}
              {!variantsLoading && variants.length === 0 && (
                <p className="bk3-variants__empty">لا توجد نسخ متاحة حاليًا.</p>
              )}
            </div>
          </div>

          {/* ── Buybox ─── */}
          <div className="bk3-buy" style={{ '--i': 9 } as React.CSSProperties}>
            {selectedVariant && !selectedVariant.is_digital && (
              <div className="bk3-buy__qty">
                <QuantitySelector value={quantity} onChange={updateQuantity} />
              </div>
            )}
            {selectedVariant?.is_digital && (
              <span className="bk3-chip bk3-chip--digital">
                <Sparkles size={13} /> نسخة رقمية
              </span>
            )}
            {!selectedVariant && (
              <span className="bk3-chip bk3-chip--muted">اختر نسخة لتحديد الكمية</span>
            )}

            <button
              type="button"
              className={`bk3-cart-btn ${addedToCart ? 'bk3-cart-btn--done' : ''}`}
              disabled={!canAddToCart}
              onClick={handleAddToCart}
            >
              <ShoppingBag size={17} />
              <span>
                {addedToCart
                  ? 'تمت الإضافة ✓'
                  : !selectedVariant
                    ? 'اختر نسخة أولًا'
                    : canAddToCart
                      ? 'أضف إلى السلة'
                      : 'غير متوفر'}
              </span>
            </button>

            <button
              type="button"
              className={`bk3-wish-btn ${wished ? 'bk3-wish-btn--on' : ''}`}
              onClick={() => toggleWishlist(product.id)}
            >
              <Heart size={15} fill={wished ? 'currentColor' : 'none'} />
              {wished ? 'محفوظ في المفضلة' : 'أضف للمفضلة'}
            </button>
          </div>

          {/* Trust */}
          <div className="bk3-trust" style={{ '--i': 10 } as React.CSSProperties}>
            <div className="bk3-trust__i"><ShieldCheck size={14} /><span>منتج أصلي</span></div>
            <div className="bk3-trust__i"><Truck size={14} /><span>شحن سريع</span></div>
            <div className="bk3-trust__i"><BookOpenText size={14} /><span>نسخ متعددة</span></div>
          </div>
        </div>
      </section>

      {/* ── Tabs ─── */}
      <section className="bk3-details" style={{ '--i': 11 } as React.CSSProperties}>
        <div className="bk3-tab-nav">
          {(['about', 'specs', 'reviews'] as DetailsTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`bk3-tab ${activeTab === tab ? 'bk3-tab--on' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'about' ? 'نبذة عن الكتاب' : tab === 'specs' ? 'المواصفات' : 'التقييمات'}
              {tab === 'reviews' && product.reviews_count > 0 && ` (${product.reviews_count})`}
            </button>
          ))}
        </div>

        <div className="bk3-tab-body">
          {activeTab === 'about' && (
            <div className="bk3-about"><p>{descriptionText}</p></div>
          )}
          {activeTab === 'specs' && (
            <dl className="bk3-specs">
              <div className="bk3-specs__r"><dt>المؤلف</dt><dd>{product.author}</dd></div>
              <div className="bk3-specs__r"><dt>التصنيف</dt><dd>{categoryLabel}</dd></div>
              <div className="bk3-specs__r"><dt>نوع المنتج</dt><dd>{product.type || 'كتاب'}</dd></div>
              <div className="bk3-specs__r"><dt>النسخ المتاحة</dt><dd>{variants.length || product.variant_count}</dd></div>
              {selectedVariant && (
                <div className="bk3-specs__r">
                  <dt>النسخة المختارة</dt>
                  <dd>{selectedVariant.variant_name}</dd>
                </div>
              )}
              {(() => {
                // Weight drives the real shipping cost (governorate + weight
                // rate table), so this needs to be visible even before the
                // customer has clicked a specific copy — not gated behind
                // "النسخة المختارة" above, which only ever shows post-pick.
                if (selectedVariant && !selectedVariant.is_digital && selectedVariant.weight_kg != null) {
                  return (
                    <div className="bk3-specs__r">
                      <dt>الوزن</dt>
                      <dd>{selectedVariant.weight_kg} كجم</dd>
                    </div>
                  );
                }
                const physicalWeights = variants
                  .filter((v) => !v.is_digital && v.weight_kg != null)
                  .map((v) => v.weight_kg as number);
                if (physicalWeights.length === 0) return null;
                const min = Math.min(...physicalWeights);
                const max = Math.max(...physicalWeights);
                const label = min === max ? `${min} كجم` : `${min}–${max} كجم حسب النسخة`;
                return (
                  <div className="bk3-specs__r">
                    <dt>الوزن</dt>
                    <dd>{label}</dd>
                  </div>
                );
              })()}
            </dl>
          )}
          {activeTab === 'reviews' && <ProductReviews productId={product.product_id} />}
        </div>
      </section>

      {/* ── Related ─── */}
      {related.length > 0 && (
        <section className="bk3-related" style={{ '--i': 12 } as React.CSSProperties}>
          <h2 className="bk3-related__hd">كتب قد تعجبك</h2>
          <div className="bk3-related__grid">
            {related.slice(0, 4).map((item) => (
              <ProductCard key={item.product_id} product={item} />
            ))}
          </div>
        </section>
      )}

      {/* ── Lightbox — a gallery, not a single frame: the open image can be
             panned when it overflows, and stepped through when the book has
             more than one image. ─── */}
      {lightboxImage && (() => {
        const idx = displayedImages.indexOf(lightboxImage);
        const many = displayedImages.length > 1;
        const step = (dir: 1 | -1) => {
          if (idx === -1) return;
          const next = (idx + dir + displayedImages.length) % displayedImages.length;
          setLightboxImage(displayedImages[next]);
          setSelectedImage(displayedImages[next]);
        };
        return (
          <div
            className="bk3-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={`صورة ${product.title}`}
            onClick={() => setLightboxImage(null)}
          >
            <button
              type="button"
              className="bk3-lightbox__close"
              onClick={() => setLightboxImage(null)}
              aria-label="إغلاق"
            >
              <X size={22} />
            </button>

            {many && (
              <>
                <button
                  type="button"
                  className="bk3-lightbox__nav bk3-lightbox__nav--prev"
                  onClick={(e) => { e.stopPropagation(); step(-1); }}
                  aria-label="الصورة السابقة"
                >
                  <ChevronRight size={26} />
                </button>
                <button
                  type="button"
                  className="bk3-lightbox__nav bk3-lightbox__nav--next"
                  onClick={(e) => { e.stopPropagation(); step(1); }}
                  aria-label="الصورة التالية"
                >
                  <ChevronLeft size={26} />
                </button>
              </>
            )}

            {/* own scroll container so a tall image can be read top to bottom
                instead of being squeezed to fit */}
            <div className="bk3-lightbox__stage" onClick={(e) => e.stopPropagation()}>
              <img src={lightboxImage} alt={product.title} />
            </div>

            {many && (
              <p className="bk3-lightbox__count" aria-live="polite">
                {idx + 1} / {displayedImages.length}
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
