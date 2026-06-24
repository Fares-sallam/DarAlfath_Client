import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, PackageCheck, Loader2 } from 'lucide-react';
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

  const [state, setState] = useState<'loading' | 'success' | 'failed' | 'pending'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);

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

    if (!merchantOrderId) {
      setState('failed');
      setErrorMessage('لم نتمكن من تحديد الطلب. حاول مرة أخرى.');
      return;
    }

    // Always verify with our backend — never trust URL params
    void verifyTransaction(merchantOrderId, fallbackClientSecret);

    async function verifyTransaction(mOrderId: string, clientSecret: string) {
      try {
        const { data, error } = await supabase.functions.invoke('check-paymob-transaction', {
          body: { merchantOrderId: mOrderId, clientSecret },
        });

        if (error) {
          setState('failed');
          setErrorMessage('تعذر التحقق من حالة الدفع. تواصل مع الدعم.');
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

        // Pending — keep polling for up to 1 minute
        let attempts = 0;
        const maxAttempts = 20;
        const interval = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            clearInterval(interval);
            setState('failed');
            setErrorMessage('انتهت مهلة التأكيد. الطلب لم يتم.');
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
      } catch (e) {
        setState('failed');
        setErrorMessage(e instanceof Error ? e.message : 'خطأ غير متوقع.');
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
