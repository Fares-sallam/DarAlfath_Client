import { useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, PackageCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/lib/supabase';

export default function PaymentResultPage() {
  usePageTitle('نتيجة الدفع');
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const didRun = useRef(false);

  const success = params.get('success') === 'true';
  const transactionId = params.get('id');
  const pending = params.get('pending') === 'true';

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const pendingOrderId = sessionStorage.getItem('paymob_pending_order_id');
    if (!pendingOrderId) return;

    if (success && !pending) {
      // ── دفع ناجح ─────────────────────────────────────────────────────────────
      // الـ Webhook يتولى تأكيد الطلب وخصم المخزون من جانب الخادم
      // نحدّث الكاش من جانب العميل فقط
      sessionStorage.removeItem('paymob_pending_order_id');
      void queryClient.invalidateQueries({ queryKey: ['product-variants-public'] });
      void queryClient.invalidateQueries({ queryKey: ['products-public-catalog'] });
    } else if (!pending) {
      // ── دفع فاشل أو ملغى ──────────────────────────────────────────────────────
      // إلغاء الطلب المعلق (المخزون لم يُخصم أصلاً فلا حاجة لإعادته)
      sessionStorage.removeItem('paymob_pending_order_id');
      supabase
        .rpc('cancel_pending_payment_order', { p_order_id: pendingOrderId })
        .then(({ error }) => {
          if (error) console.warn('[payment-result] cancel failed:', error.message);
          else console.log('[payment-result] Pending order cancelled:', pendingOrderId);
        });
    }
  }, [success, pending, queryClient]);

  if (success && !pending) {
    return (
      <div className="page-sections">
        <section className="page-card">
          <div className="empty-state">
            <CheckCircle2 size={48} color="var(--accent)" />
            <h3>تمت عملية الدفع بنجاح</h3>
            <p>تم استلام دفعتك وسيتم معالجة طلبك قريبًا.</p>
            {transactionId && (
              <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>
                رقم المعاملة: {transactionId}
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
          <p>
            {pending
              ? 'الدفعة قيد المعالجة. سنُخطرك عند اكتمالها.'
              : 'تعذر إتمام الدفع. يمكنك المحاولة مرة أخرى أو اختيار طريقة دفع مختلفة.'}
          </p>
          <div className="empty-state__actions">
            <Link to="/checkout" className="primary-button">
              إعادة المحاولة
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
