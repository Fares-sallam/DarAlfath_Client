import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, PackageCheck, Loader2, Clock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/contexts/CartContext';

/**
 * After a Paymob redirect, the URL contains success/status params + HMAC.
 *
 * IMPORTANT — we do NOT trust those params (a user can edit them in the URL).
 * Instead, we extract `merchant_order_id` and ask our backend to verify the
 * REAL transaction status by querying Paymob's API server-to-server.
 *
 * The browser params are only used to find which order to check.
 */
export default function PaymentResultPage() {
  usePageTitle('نتيجة الدفع');
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { clearCart } = useCart();
  const didRun = useRef(false);

  // `unconfirmed` ≠ `failed`. `failed` means Paymob told us the payment did NOT
  // go through. `unconfirmed` means we simply could not get an answer in time —
  // the money may well have been taken. Conflating the two told paying customers
  // "الطلب لم يتم" and invited them to pay a second time.
  const [state, setState] = useState<'loading' | 'success' | 'failed' | 'unconfirmed' | 'pending'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    // Extract merchant_order_id: URL param first, then localStorage fallback.
    // We intentionally skip `order_id` — that's Paymob's internal id, not ours.
    const merchantOrderIdFromUrl = params.get('merchant_order_id') ?? null;
    const fallbackOrderId = localStorage.getItem('paymob_pending_order_id');
    const fallbackClientSecret = localStorage.getItem('paymob_pending_client_secret') ?? '';
    const merchantOrderId = merchantOrderIdFromUrl ?? fallbackOrderId;
    const clearPendingPaymob = () => {
      localStorage.removeItem('paymob_pending_order_id');
      localStorage.removeItem('paymob_pending_client_secret');
    };

    // Paymob appends the full transaction detail to this redirect — amount,
    // card last-4, brand, transaction/order ids, merchant profile id. None of
    // it is secret (the `hmac` is a signature, not a key) and none of it is
    // trusted below, but leaving it in the address bar parks that detail in
    // browser history, screenshots and anything that captures URLs. We have
    // everything we need in local variables by this point, so drop it.
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (!merchantOrderId) {
      setState('failed');
      setErrorMessage('لم نتمكن من تحديد الطلب. حاول مرة أخرى.');
      return;
    }

    setReference(merchantOrderId);

    // Always verify with our backend — never trust URL params
    void verifyTransaction(merchantOrderId, fallbackClientSecret);

    async function verifyTransaction(mOrderId: string, clientSecret: string) {
      try {
        const { data, error } = await supabase.functions.invoke('check-paymob-transaction', {
          body: { merchantOrderId: mOrderId, clientSecret },
        });

        // A transport/auth error tells us nothing about the payment itself —
        // treat it as "unknown", never as a failure.
        if (error) {
          setState('unconfirmed');
          return;
        }

        if (data?.status === 'success') {
          setState('success');
          setOrderId(data.orderId);
          clearPendingPaymob();
          clearCart();
          void queryClient.invalidateQueries({ queryKey: ['product-variants-public'] });
          void queryClient.invalidateQueries({ queryKey: ['products-public-catalog'] });
          return;
        }

        if (data?.status === 'failed') {
          setState('failed');
          setErrorMessage(data.error || 'فشلت عملية الدفع.');
          clearPendingPaymob();
          return;
        }

        // Pending — keep polling. 3 minutes, not 1: a slow Paymob lookup or a
        // late webhook used to trip the old 60s cutoff and report a paid order
        // as failed. We deliberately do NOT clear the stored order id on
        // timeout, so a refresh re-checks instead of stranding the payment.
        let attempts = 0;
        const maxAttempts = 60;
        const interval = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            clearInterval(interval);
            setState('unconfirmed');
            return;
          }
          const { data: poll } = await supabase.functions.invoke('check-paymob-transaction', {
            body: { merchantOrderId: mOrderId, clientSecret },
          });
          if (poll?.status === 'success') {
            clearInterval(interval);
            setState('success');
            setOrderId(poll.orderId);
            clearPendingPaymob();
            clearCart();
            void queryClient.invalidateQueries({ queryKey: ['product-variants-public'] });
            void queryClient.invalidateQueries({ queryKey: ['products-public-catalog'] });
          } else if (poll?.status === 'failed') {
            clearInterval(interval);
            setState('failed');
            setErrorMessage(poll.error || 'فشلت عملية الدفع.');
            clearPendingPaymob();
          }
        }, 3000);
      } catch {
        // Same reasoning as the transport-error branch above: unknown, not failed.
        setState('unconfirmed');
      }
    }
  }, [params, queryClient, clearCart]);

  if (state === 'loading' || state === 'pending') {
    return (
      <div className="page-sections">
        <section className="page-card">
          <div className="empty-state">
            <Loader2 size={48} className="paymob-modal__spinner" />
            <h3>جارٍ التحقق من عملية الدفع</h3>
            <p>برجاء الانتظار قليلاً... نتأكد من Paymob مباشرةً.</p>
          </div>
        </section>
      </div>
    );
  }

  // We could not reach a verdict. The payment may have succeeded, so the one
  // thing this screen must never do is imply the order failed or nudge the
  // customer into paying twice.
  if (state === 'unconfirmed') {
    return (
      <div className="page-sections">
        <section className="page-card">
          <div className="empty-state">
            <Clock size={48} color="var(--gold, #d4a24a)" />
            <h3>لم نتمكن من تأكيد الدفع بعد</h3>
            <p>
              لو تم خصم المبلغ من حسابك، فطلبك محفوظ وسيتم تأكيده تلقائيًا خلال دقائق.
            </p>
            <p style={{ fontWeight: 700 }}>
              من فضلك لا تدفع مرة أخرى حتى لا يُخصم المبلغ مرتين.
            </p>
            {reference && (
              <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>
                رقم العملية: {reference}
              </p>
            )}
            <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>
              حدّث الصفحة بعد قليل للتأكد، أو تواصل معنا برقم العملية لو استمرت المشكلة.
            </p>
            <div className="empty-state__actions">
              <Link to="/account/orders" className="primary-button">
                <PackageCheck size={16} />
                عرض طلباتي
              </Link>
              <Link to="/contact" className="ghost-button">
                تواصل معنا
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="page-sections">
        <section className="page-card">
          <div className="empty-state">
            <CheckCircle2 size={48} color="var(--accent)" />
            <h3>تمت عملية الدفع بنجاح</h3>
            <p>تم استلام دفعتك وسيتم معالجة طلبك قريبًا.</p>
            {orderId && (
              <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>
                رقم الطلب: {orderId}
              </p>
            )}
            <div className="empty-state__actions">
              <Link to="/account/orders" className="primary-button">
                <PackageCheck size={16} />
                عرض طلباتي
              </Link>
              <Link to="/" className="ghost-button">
                العودة للرئيسية
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-sections">
      <section className="page-card">
        <div className="empty-state">
          <XCircle size={48} color="#e53e3e" />
          <h3>لم تكتمل عملية الدفع</h3>
          <p>{errorMessage || 'تعذر إتمام الدفع. يمكنك المحاولة مرة أخرى أو اختيار طريقة دفع مختلفة.'}</p>
          <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>
            لا تقلق — كتبك لا تزال في سلتك. ارجع لإتمام الطلب.
          </p>
          <div className="empty-state__actions">
            <Link to="/cart" className="primary-button">
              إعادة المحاولة
            </Link>
            <Link to="/cart" className="ghost-button">
              عرض السلة
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
