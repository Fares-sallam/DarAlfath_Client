import { Link } from 'react-router-dom';
import { BookOpenCheck, Download, ExternalLink, FileClock } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { formatMoney } from '@/hooks/useStorefront';
import { formatStorefrontOrderDate } from '@/lib/storefrontOrders';

export default function DownloadsPage() {
  usePageTitle('مكتبتي الرقمية');
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useCustomerOrders();
  const downloads = orders.flatMap((order) =>
    (order.order_items ?? [])
      .filter((item) => item.is_digital)
      .map((item) => ({ order, item }))
  );

  return (
    <div className="page-sections">
      <section className="page-card">
        <div className="page-card__head">
          <div>
            <span className="page-kicker">التنزيلات الرقمية</span>
            <h1>مكتبتي الرقمية</h1>
            <p>النسخ الرقمية تظهر بعد تسجيل الطلب في قاعدة البيانات وتحديث حالته من لوحة التحكم.</p>
          </div>
          <div className="orders-summary-pill">
            <Download size={16} />
            {downloads.length} ملف
          </div>
        </div>

        {!user ? (
          <div className="empty-state">
            <Download size={28} />
            <h3>سجّل الدخول للوصول للتنزيلات</h3>
            <p>التنزيلات مرتبطة بحساب العميل والطلبات المسجلة في Supabase.</p>
            <Link to="/account" className="primary-button">تسجيل الدخول</Link>
          </div>
        ) : isLoading ? (
          <section className="page-card page-card--loading" />
        ) : downloads.length ? (
          <div className="download-library">
            {downloads.map(({ order, item }) => {
              const currency = order.countries?.currency_symbol || 'ج.م';
              const downloadable = ['تم التأكيد', 'جاري الشحن', 'تم التوصيل'].includes(order.status);

              return (
                <article className="download-card" key={`${order.id}:${item.id}`}>
                  <div className="download-card__cover">
                    {item.products?.cover_url ? (
                      <img src={item.products.cover_url} alt={item.products.title} />
                    ) : (
                      <img src="/branding/dar-alfath-logo.jpeg" alt="دار الفتح" />
                    )}
                  </div>

                  <div className="download-card__body">
                    <span className="status-chip status-chip--soft">
                      <BookOpenCheck size={14} />
                      {order.status}
                    </span>
                    <h3>{item.products?.title || 'كتاب رقمي'}</h3>
                    <p>{item.product_variants?.variant_name || 'نسخة رقمية'} - طلب {order.id}</p>
                    <small>{formatStorefrontOrderDate(order.created_at)} · {user.email}</small>
                  </div>

                  <div className="download-card__action">
                    <b>{formatMoney((item.price_per_item - item.discount_per_item) * item.quantity, currency)}</b>
                    {item.download_url && downloadable ? (
                      <a
                        href={item.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="primary-button"
                      >
                        <Download size={15} />
                        تنزيل الملف
                        <ExternalLink size={13} />
                      </a>
                    ) : (
                      <button type="button" className="ghost-button" disabled>
                        <FileClock size={15} />
                        {downloadable ? 'بانتظار رابط التنزيل' : 'بانتظار موافقة الإدارة'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <Download size={28} />
            <h3>لا توجد تنزيلات بعد</h3>
            <p>عند شراء نسخة رقمية وتسجيل الطلب ستظهر هنا تلقائيًا.</p>
            <Link to="/books?type=رقمي" className="primary-button">
              تصفح النسخ الرقمية
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
