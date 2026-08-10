import { ArrowLeft, ShoppingBag, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import QuantitySelector from '@/components/QuantitySelector';
import { useCart } from '@/contexts/CartContext';
import { formatMoney } from '@/hooks/useStorefront';
import { usePageTitle } from '@/hooks/usePageTitle';
import { OrnamentDivider } from '@/components/Ornament';

export default function CartPage() {
  usePageTitle('سلة المشتريات');
  const navigate = useNavigate();
  const {
    items,
    count,
    subtotal,
    shipping,
    total,
    currencySymbol,
    updateQuantity,
    removeFromCart,
    clearCart,
    unavailableRemoved,
  } = useCart();

  return (
    <div className="page-sections page-sections--cart">
      <section className="cart-head">
        <div className="cart-head__row">
          <div>
            <p className="cart-head__eyebrow">السلة</p>
            <h1>سلة المشتريات</h1>
            <p className="cart-head__lede">راجع الكتب المختارة قبل الانتقال إلى إتمام الطلب.</p>
          </div>

          {items.length > 0 ? (
            <button type="button" className="ghost-button" onClick={clearCart}>
              مسح السلة
            </button>
          ) : null}
        </div>
        <OrnamentDivider />
      </section>

      {unavailableRemoved.length > 0 ? (
        <div className="auth-alert auth-alert--warning" style={{ fontSize: '0.9rem' }}>
          لم تعد هذه المنتجات متاحة وتمت إزالتها من سلتك: {unavailableRemoved.join('، ')}
        </div>
      ) : null}

      {items.length ? (
        <div className="cart-layout-v2">
          <div className="cart-rows">
            {items.map((item, i) => (
              <article
                key={item.key}
                className="cart-row"
                style={{ '--i': i } as React.CSSProperties}
              >
                <div className="cart-row__cover">
                  {item.image ? (
                    <img src={item.image} alt={item.title} loading="lazy" />
                  ) : (
                    <img src="/branding/dar-alfath-logo.jpeg" alt="دار الفتح" />
                  )}
                </div>

                <div className="cart-row__content">
                  <h3>{item.title}</h3>
                  <p>{item.variant_name}</p>
                  <span className="cart-row__type">{item.variant_type}</span>
                </div>

                <div className="cart-row__controls">
                  {item.is_digital ? (
                    <span className="availability-chip">رقمي × 1</span>
                  ) : (
                    <QuantitySelector
                      value={item.quantity}
                      onChange={(value) => updateQuantity(item.key, value)}
                    />
                  )}

                  <strong className="cart-row__price">
                    {formatMoney(item.price * item.quantity, item.currency_symbol)}
                  </strong>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.key)}
                    className="cart-row__remove"
                    aria-label="حذف من السلة"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>

          <aside className="cart-summary">
            <p className="cart-summary__eyebrow">ملخص الطلب</p>

            <div className="cart-summary__row">
              <span>عدد العناصر</span>
              <b>{count}</b>
            </div>

            <div className="cart-summary__row">
              <span>الإجمالي الفرعي</span>
              <b>{formatMoney(subtotal, currencySymbol)}</b>
            </div>

            <div className="cart-summary__row">
              <span>الشحن</span>
              <b>{formatMoney(shipping, currencySymbol)}</b>
            </div>

            <div className="cart-summary__row cart-summary__row--total">
              <span>الإجمالي النهائي</span>
              <b>{formatMoney(total, currencySymbol)}</b>
            </div>

            <button
              type="button"
              className="primary-button primary-button--full"
              onClick={() => navigate('/checkout')}
            >
              متابعة الدفع
              <ArrowLeft size={16} />
            </button>

            <Link to="/books" className="ghost-button ghost-button--full">
              متابعة التسوق
            </Link>
          </aside>
        </div>
      ) : (
        <div className="cart-empty">
          <div className="cart-empty__icon">
            <ShoppingBag size={26} />
          </div>
          <h3>السلة فارغة</h3>
          <p>ابدأ بإضافة بعض الكتب ثم عد إلى هنا لإتمام الطلب.</p>
          <Link to="/books" className="primary-button">
            تسوّق الآن
          </Link>
        </div>
      )}
    </div>
  );
}
