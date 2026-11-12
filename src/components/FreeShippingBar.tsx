import { PartyPopper, Truck } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { formatMoney } from '@/hooks/useStorefront';
import '@/styles-cart-bar.css';

const endsLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });

/**
 * The bar at the bottom of the cart: how far the cart is from the free-shipping offer, filling up
 * as books are added ("أضفت كذا، وباقي كذا"), and a short celebration once it is reached. Shows only
 * while there is a live offer for the website, in Egypt, with at least one paper book in the cart.
 */
export default function FreeShippingBar() {
  const { subtotal, freeShippingThreshold, remainingForFreeShipping, freeShippingOffer, hasPhysicalItems, currencySymbol } = useCart();
  if (!hasPhysicalItems || freeShippingThreshold <= 0) return null;

  const reached = remainingForFreeShipping <= 0;
  const percent = Math.min(100, Math.max(0, (subtotal / freeShippingThreshold) * 100));
  const money = (n: number) => formatMoney(n, currencySymbol);

  return (
    <div className={`free-ship-bar${reached ? ' free-ship-bar--done' : ''}`} data-testid="free-shipping-bar">
      <div className="free-ship-bar__inner">
        <span className="free-ship-bar__icon" aria-hidden>
          {reached ? <PartyPopper size={20} /> : <Truck size={20} />}
        </span>
        <div className="free-ship-bar__body">
          <p className="free-ship-bar__headline" aria-live="polite">
            {reached ? (
              <>مبروك! طلبك عليه <b>شحن مجاني</b></>
            ) : (
              <>باقي <b>{money(remainingForFreeShipping)}</b> وتاخد <b>شحن مجاني</b></>
            )}
          </p>
          <div
            className="free-ship-bar__track"
            role="progressbar"
            aria-label="التقدم نحو الشحن المجاني"
            aria-valuemin={0}
            aria-valuemax={Math.round(freeShippingThreshold)}
            aria-valuenow={Math.round(Math.min(subtotal, freeShippingThreshold))}
          >
            <span className="free-ship-bar__fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="free-ship-bar__meta">
            <span>أضفت <b>{money(subtotal)}</b> من <b>{money(freeShippingThreshold)}</b></span>
            {freeShippingOffer.endsAt ? <span>العرض لحد {endsLabel(freeShippingOffer.endsAt)}</span> : null}
          </p>
        </div>
      </div>
    </div>
  );
}
