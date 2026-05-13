import { Heart, ShoppingBag, Sparkles, ShieldCheck, Truck, BookOpenText, X, Star, Tag, Layers } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import ProductCard from '@/components/ProductCard';
import QuantitySelector from '@/components/QuantitySelector';
import {
  formatCatalogPrice,
  formatMoney,
  useProductDetails,
  useProductVariants,
  useRelatedProducts,
} from '@/hooks/useStorefront';
import { useWishlist } from '@/contexts/WishlistContext';
import { useCart } from '@/contexts/CartContext';
import type { ProductVariantItem } from '@/types/store';

type DetailsTab = 'about' | 'specs' | 'similar';

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

  const { isInWishlist, toggleWishlist } = useWishlist();
  const { addToCart } = useCart();

  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<DetailsTab>('about');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const displayedImages = useMemo(() => {
    if (!product) return [];
    return product.images?.length
      ? product.images
      : ([product.cover_url].filter(Boolean) as string[]);
  }, [product]);

  const selectedVariant = useMemo<ProductVariantItem | null>(() => {
    return variants.find((item) => item.variant_id === selectedVariantId) ?? null;
  }, [variants, selectedVariantId]);

  useEffect(() => {
    setSelectedImage(displayedImages[0] ?? null);
    setLightboxImage(null);
  }, [displayedImages, product?.product_id]);

  useEffect(() => {
    setQuantity(1);
  }, [selectedVariantId]);

  useEffect(() => {
    if (!lightboxImage) return undefined;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxImage(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxImage]);

  const updateQuantity = (value: number) => {
    if (!selectedVariant || selectedVariant.is_digital) { setQuantity(1); return; }
    const max = selectedVariant.available_stock ?? value;
    setQuantity(Math.max(1, Math.min(Math.floor(value || 1), max)));
  };

  if (isLoading) return <div className="bk-loading" />;

  if (!product) {
    return (
      <div className="page-card bk-not-found">
        <h1>الكتاب غير موجود</h1>
        <p>قد يكون هذا الكتاب غير متاح في الدولة الحالية أو تم حذفه من العرض.</p>
        <Link to="/books" className="primary-button">العودة للكتب</Link>
      </div>
    );
  }

  const wished       = isInWishlist(product.id);
  const categoryLabel = product.category_name || product.category?.name || 'غير محدد';
  const canAddToCart  = Boolean(selectedVariant?.is_available);
  const mainImage     = selectedImage || product.cover_url || null;
  const descriptionText = product.description ||
    'هذا الإصدار مصمم بعناية ليمنح القارئ تجربة قراءة مريحة، مع عرض واضح ونسخ متعددة تناسب الاستخدامات المختلفة.';

  return (
    <div className="page-sections">

      {/* ── Breadcrumb ─────────────────────────────────── */}
      <nav className="bk-breadcrumb">
        <Link to="/">الرئيسية</Link>
        <span>/</span>
        <Link to="/books">الكتب</Link>
        {product.category_slug && (
          <><span>/</span>
          <Link to={`/books?category=${product.category_slug}`}>{categoryLabel}</Link></>
        )}
        <span>/</span>
        <strong>{product.title}</strong>
      </nav>

      {/* ── Main Layout ─────────────────────────────────── */}
      <div className="bk-layout">

        {/* ── Gallery ─── */}
        <aside className="bk-gallery">
          <button
            type="button"
            className="bk-gallery__main"
            onClick={() => mainImage && setLightboxImage(mainImage)}
            disabled={!mainImage}
          >
            {mainImage
              ? <img src={mainImage} alt={product.title} />
              : <div className="bk-gallery__placeholder">
                  <img src="/branding/dar-alfath-logo.jpeg" alt="دار الفتح" />
                </div>
            }
          </button>

          {displayedImages.length > 1 && (
            <div className="bk-gallery__thumbs">
              {displayedImages.slice(0, 5).map((img) => (
                <button
                  key={img}
                  type="button"
                  className={img === mainImage ? 'bk-gallery__thumb active' : 'bk-gallery__thumb'}
                  onClick={() => setSelectedImage(img)}
                >
                  <img src={img} alt={product.title} />
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* ── Info Panel ─── */}
        <div className="bk-panel">

          {/* Category + wishlist */}
          <div className="bk-panel__eyebrow">
            <Link to={`/books?category=${product.category_slug}`} className="bk-category-tag">
              <Tag size={12} />
              {categoryLabel}
            </Link>
            <button
              type="button"
              className={wished ? 'bk-wish bk-wish--active' : 'bk-wish'}
              onClick={() => toggleWishlist(product.id)}
            >
              <Heart size={15} fill={wished ? 'currentColor' : 'none'} />
              {wished ? 'محفوظ' : 'المفضلة'}
            </button>
          </div>

          {/* Title & author */}
          <h1 className="bk-panel__title">{product.title}</h1>
          <p className="bk-panel__author">
            <BookOpenText size={14} />
            {product.author}
          </p>

          {/* Rating */}
          <div className="bk-panel__rating">
            {[1,2,3,4,5].map(i => (
              <Star key={i} size={14} fill="currentColor" />
            ))}
            <span>{product.rating ?? '4.8'}</span>
            <span className="bk-panel__rating-sep">·</span>
            <span>تقييم القرّاء</span>
          </div>

          {/* Price */}
          <div className="bk-panel__price">
            <strong>
              {selectedVariant
                ? formatMoney(selectedVariant.display_price, selectedVariant.currency_symbol)
                : formatCatalogPrice(product)}
            </strong>
            {selectedVariant?.compare_at_price
              ? <del>{formatMoney(selectedVariant.compare_at_price, selectedVariant.currency_symbol)}</del>
              : null}
          </div>

          {/* Short description */}
          <p className="bk-panel__desc">{descriptionText}</p>

          <div className="bk-divider" />

          {/* Variant selector */}
          <div className="bk-variants">
            <div className="bk-variants__head">
              <Layers size={15} />
              <span>اختر النسخة</span>
              <small>
                {variantsLoading ? '...' : `${variants.length || product.variant_count} نسخة`}
              </small>
            </div>
            <div className="bk-variants__grid">
              {variants.map((v) => (
                <button
                  key={v.variant_id}
                  type="button"
                  className={v.variant_id === selectedVariant?.variant_id ? 'bk-vpill bk-vpill--active' : 'bk-vpill'}
                  onClick={() => setSelectedVariantId(v.variant_id)}
                  disabled={!v.is_available}
                >
                  <span className="bk-vpill__name">{v.variant_name}</span>
                  <b className="bk-vpill__price">{formatMoney(v.display_price, v.currency_symbol)}</b>
                  <small className="bk-vpill__avail">
                    {v.is_digital ? '⚡ رقمي فوري' : v.availability_text || 'غير متوفر'}
                  </small>
                </button>
              ))}
              {!variantsLoading && variants.length === 0 && (
                <p className="bk-variants__empty">لا توجد نسخ متاحة حاليًا.</p>
              )}
            </div>
          </div>

          {/* Qty + add to cart */}
          <div className="bk-buybox">
            {selectedVariant && !selectedVariant.is_digital && (
              <div className="bk-buybox__qty">
                <QuantitySelector value={quantity} onChange={updateQuantity} />
              </div>
            )}
            {selectedVariant?.is_digital && (
              <span className="bk-chip bk-chip--info">
                <Sparkles size={13} /> نسخة رقمية — كمية 1 فقط
              </span>
            )}
            {!selectedVariant && (
              <span className="bk-chip bk-chip--muted">اختر نسخة لتحديد الكمية</span>
            )}

            <div className="bk-buybox__actions">
              <button
                type="button"
                className="primary-button primary-button--full bk-btn-cart"
                disabled={!canAddToCart}
                onClick={() => {
                  if (!selectedVariant) return;
                  addToCart(product, selectedVariant, selectedVariant.is_digital ? 1 : quantity);
                }}
              >
                <ShoppingBag size={17} />
                {!selectedVariant ? 'اختر نسخة أولًا' : canAddToCart ? 'أضف إلى السلة' : 'غير متوفر'}
              </button>
              <button
                type="button"
                className={wished ? 'bk-btn-wish bk-btn-wish--active' : 'bk-btn-wish'}
                onClick={() => toggleWishlist(product.id)}
              >
                <Heart size={16} fill={wished ? 'currentColor' : 'none'} />
                {wished ? 'محفوظ' : 'أضف للمفضلة'}
              </button>
            </div>
          </div>

          {/* Trust badges */}
          <div className="bk-trust">
            <div className="bk-trust__item">
              <ShieldCheck size={15} />
              <span>منتج أصلي معتمد</span>
            </div>
            <div className="bk-trust__item">
              <Truck size={15} />
              <span>شحن سريع وآمن</span>
            </div>
            <div className="bk-trust__item">
              <BookOpenText size={15} />
              <span>نسخ متعددة</span>
            </div>
          </div>

        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────── */}
      <div className="bk-tabs">
        <div className="bk-tabs__nav">
          {(['about', 'specs', 'similar'] as DetailsTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'bk-tabs__btn active' : 'bk-tabs__btn'}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'about' ? 'نبذة عن الكتاب' : tab === 'specs' ? 'المواصفات' : 'كتب مشابهة'}
            </button>
          ))}
        </div>

        <div className="bk-tabs__body">
          {activeTab === 'about' && (
            <div className="bk-tabs__about">
              <p>{descriptionText}</p>
            </div>
          )}

          {activeTab === 'specs' && (
            <dl className="bk-specs">
              <div className="bk-specs__row"><dt>المؤلف</dt><dd>{product.author}</dd></div>
              <div className="bk-specs__row"><dt>التصنيف</dt><dd>{categoryLabel}</dd></div>
              <div className="bk-specs__row"><dt>نوع المنتج</dt><dd>{product.type || 'كتاب'}</dd></div>
              <div className="bk-specs__row"><dt>النسخ المتاحة</dt><dd>{variants.length || product.variant_count}</dd></div>
              {selectedVariant && (
                <div className="bk-specs__row">
                  <dt>النسخة المختارة</dt>
                  <dd>{selectedVariant.variant_name}</dd>
                </div>
              )}
            </dl>
          )}

          {activeTab === 'similar' && (
            related.length > 0
              ? <div className="books-grid books-grid--related">
                  {related.slice(0, 4).map((item) => (
                    <ProductCard key={item.product_id} product={item} compact />
                  ))}
                </div>
              : <p className="bk-tabs__empty">لا توجد كتب مشابهة حاليًا.</p>
          )}
        </div>
      </div>

      {/* ── Related books ────────────────────────────────── */}
      {related.length > 0 && activeTab !== 'similar' && (
        <section className="bk-related">
          <div className="bk-related__head">
            <h2>قد يعجبك أيضًا</h2>
            <Link to={`/books?category=${product.category_slug}`}>عرض التصنيف</Link>
          </div>
          <div className="books-grid books-grid--related">
            {related.slice(0, 4).map((item) => (
              <ProductCard key={item.product_id} product={item} compact />
            ))}
          </div>
        </section>
      )}

      {/* ── Lightbox ─────────────────────────────────────── */}
      {lightboxImage && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`صورة ${product.title}`}
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            className="image-lightbox__close"
            onClick={() => setLightboxImage(null)}
            aria-label="إغلاق"
          >
            <X size={22} />
          </button>
          <img src={lightboxImage} alt={product.title} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
