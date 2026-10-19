import { useEffect, useRef, useState } from 'react';
import { Check, ShoppingBag, X, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import QuantitySelector from '@/components/QuantitySelector';
import { useCart } from '@/contexts/CartContext';
import { formatMoney, useCatalogVariants } from '@/hooks/useStorefront';
import { EXPRESS_CHECKOUT_PATH, isApplePaySupported } from '@/lib/applePay';
import { flyToCart } from '@/lib/flyToCart';
import type { ProductItem, ProductVariantItem } from '@/types/store';

/**
 * A book card's buttons. A book sold in one edition goes straight into the cart from here ("أضف للسلة"),
 * and once it is there the button becomes a counter (down to zero takes it out). A book in several
 * editions keeps "عرض التفاصيل", where they are compared. Under it, "شراء سريع" puts the book in the
 * cart and opens checkout; with several editions a short list asks which one first. On a device that can
 * pay with Apple Pay, checkout opens in its one-screen form (delivery details, then Apple Pay).
 *
 * Until the editions are known the card just links to the book, so nothing is offered that can't be done.
 */
export default function CardBuyActions({
  product,
  coverRef,
  onOpen,
}: {
  product: ProductItem;
  /** The cover, for the picture that flies to the cart. */
  coverRef: React.RefObject<HTMLElement | null>;
  onOpen: () => void;
}) {
  const navigate = useNavigate();
  const { data: byBook } = useCatalogVariants();
  const { addToCart, itemForVariant, updateQuantity, removeFromCart } = useCart();
  const [picking, setPicking] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const quickRef = useRef<HTMLButtonElement | null>(null);

  const editions = byBook ? byBook.get(product.product_id) ?? [] : null;
  const single = editions?.length === 1 ? editions[0] : null;
  const line = single ? itemForVariant(single.variant_id) : undefined;
  const canBuy = Boolean(editions?.some((v) => v.is_available));

  const add = (variant: ProductVariantItem) => {
    addToCart(product, variant, 1);
    flyToCart(coverRef.current);
  };

  // What is already in the cart stays as it is: quick buy doesn't add a second copy.
  const buyNow = (variant: ProductVariantItem) => {
    if (!variant.is_available) return;
    if (!itemForVariant(variant.variant_id)) addToCart(product, variant, 1);
    navigate(isApplePaySupported() ? EXPRESS_CHECKOUT_PATH : '/checkout');
  };

  // The edition list opens on its first choice; a click outside closes it, and so does Escape
  // (handled on the list and the buttons themselves, since their keys don't travel past the card).
  useEffect(() => {
    if (!picking) return undefined;
    pickerRef.current?.querySelector<HTMLButtonElement>('button.book-card__edition:not(:disabled)')?.focus();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (pickerRef.current?.contains(target) || quickRef.current?.contains(target)) return;
      setPicking(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [picking]);

  const keepKeysInside = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape' && picking) {
      setPicking(false);
      quickRef.current?.focus();
    }
  };

  let main: React.ReactNode;
  if (single && !single.is_available) {
    main = (
      <button type="button" className="primary-button book-card__main" disabled>
        غير متوفر حاليًا
      </button>
    );
  } else if (single && line && single.is_digital) {
    main = (
      <button type="button" className="primary-button book-card__main book-card__main--in" onClick={() => navigate('/cart')}>
        <Check size={15} aria-hidden="true" />
        في السلة
      </button>
    );
  } else if (single && line) {
    main = (
      <div className="book-card__stepper" data-testid="card-stepper">
        <QuantitySelector
          compact
          value={line.quantity}
          min={0}
          max={single.available_stock}
          onChange={(quantity) => (quantity <= 0 ? removeFromCart(line.key) : updateQuantity(line.key, quantity))}
        />
      </div>
    );
  } else if (single) {
    main = (
      <button type="button" className="primary-button book-card__main" onClick={() => add(single)}>
        <ShoppingBag size={15} aria-hidden="true" />
        أضف للسلة
      </button>
    );
  } else {
    main = (
      <button type="button" className="primary-button book-card__main" onClick={onOpen}>
        عرض التفاصيل
      </button>
    );
  }

  return (
    <>
      {/* Nothing in here opens the book: the card around it does, on a click or Enter. */}
      <div className="book-card__actions" onClick={(e) => e.stopPropagation()} onKeyDown={keepKeysInside}>
        {main}
        {canBuy && (
          <button
            ref={quickRef}
            type="button"
            className="book-card__quick"
            aria-haspopup={single ? undefined : 'dialog'}
            aria-expanded={single ? undefined : picking}
            onClick={() => (single ? buyNow(single) : setPicking((open) => !open))}
          >
            <Zap size={14} aria-hidden="true" />
            شراء سريع
          </button>
        )}
      </div>

      {picking && editions && (
        <div
          ref={pickerRef}
          className="book-card__picker"
          role="dialog"
          aria-label={`اختر طبعة ${product.title}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={keepKeysInside}
        >
          <div className="book-card__picker-head">
            <b>اختر الطبعة</b>
            <button type="button" onClick={() => { setPicking(false); quickRef.current?.focus(); }} aria-label="إغلاق">
              <X size={15} />
            </button>
          </div>
          <ul>
            {editions.map((variant) => (
              <li key={variant.variant_id}>
                <button
                  type="button"
                  className="book-card__edition"
                  disabled={!variant.is_available}
                  onClick={() => buyNow(variant)}
                >
                  <span>{variant.variant_name}</span>
                  <b>{formatMoney(variant.display_price, variant.currency_symbol)}</b>
                  <small>{variant.is_digital ? 'رقمي' : variant.is_available ? 'متوفر' : 'غير متوفر'}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
