import { ArrowLeft, Gift, ShoppingBag, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import QuantitySelector from '@/components/QuantitySelector';
import { useCart } from '@/contexts/CartContext';
import { formatMoney } from '@/hooks/useStorefront';
import { usePageTitle } from '@/hooks/usePageTitle';

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
    freeShippingThreshold,
    remainingForFreeShipping,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart();

  const hasPhysical = items.some((item) => !item.is_digital);
  const freeShippingProgress = freeShippingThreshold > 0 && hasPhysical
    ? Math.min(100, (subtotal / freeShippingThreshold) * 100)
    : 0;

  return (
    <div className="page-sections">
      <section className="page-card">
        <div className="page-card__head">
          <div>
            <span className="page-kicker">السلة</span>
            <h1>سلة المشتريات</h1>
            <p>راجع الكتب المختارة قبل الانتقال إلى إتمام الطلب.</p>
          </div>

          {items.length > 0 ? (
            <button
              type="button"
              className="ghost-button"
              onClick={clearCart}
            >
              مسح السلة
            </button>
          ) : null}
        </div>

        {items.length ? (
          <div className="cart-layout">
            <div className="cart-list">
              {items.map((item) => (
                <article key={item.key} className="cart-item">
                  <div className="cart-item__cover">
                    {item.image ? (
                      <img src={item.image} alt={item.title} />
                    ) : (
                      <img
                        src="/branding/dar-alfath-logo.jpeg"
                        alt="دار الفتح"
                      />
                    )}
                  </div>

                  <div className="cart-item__content">
                    <h3>{item.title}</h3>
                    <p>{item.variant_name}</p>
                    <span>{item.variant_type}</span>
                  </div>

                  <div className="cart-item__controls">
                    {item.is_digital ? (
                      <span className="availability-chip">رقمي × 1</span>
                    ) : (
                      <QuantitySelector
                        value={item.quantity}
                        onChange={(value) => updateQuantity(item.key, value)}
                      />
                    )}

                    <strong>
                      {formatMoney(item.price * item.quantity, item.currency_symbol)}
                    </strong>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item.key)}
                      className="icon-button"
                      aria-label="حذف من السلة"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <aside className="order-summary">
              <h3>ملخص الطلب</h3>

              {hasPhysical && freeShippingThreshold > 0 ? (
                <div className="free-shipping-bar">
                  <div className="free-shipping-bar__label">
                    <Gift size={14} />
                    {remainingForFreeShipping === 0
                      ? 'مبروك! حصلت على شحن مجاني'
                      : `أضف ${formatMoney(remainingForFreeShipping, currencySymbol)} للحصول على شحن مجاني`}
                  </div>
                  <div className="free-shipping-bar__track">
                    <div className="free-shipping-bar__fill" style={{ width: `${freeShippingProgress}%` }} />
                  </div>
                </div>
              ) : null}

              <div>
                <span>عدد العناصر</span>
                <b>{count}</b>
              </div>

              <div>
                <span>الإجمالي الفرعي</span>
                <b>{formatMoney(subtotal, currencySymbol)}</b>
              </div>

              <div>
                <span>الشحن</span>
                <b>{formatMoney(shipping, currencySymbol)}</b>
              </div>

              <div className="order-summary__total">
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
          <div className="empty-state">
            <ShoppingBag size={24} />
            <h3>السلة فارغة</h3>
            <p>ابدأ بإضافة بعض الكتب ثم عد إلى هنا لإتمام الطلب.</p>
            <Link to="/books" className="primary-button">
              تسوّق الآن
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
