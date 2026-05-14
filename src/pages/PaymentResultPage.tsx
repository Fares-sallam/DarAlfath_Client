import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, PackageCheck } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function PaymentResultPage() {
  usePageTitle('نتيجة الدفع');
  const [params] = useSearchParams();

  const success = params.get('success') === 'true';
  const transactionId = params.get('id');
  const pending = params.get('pending') === 'true';

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
