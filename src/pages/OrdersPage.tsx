import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, CircleDot, ClipboardList, PackageCheck, ReceiptText, Truck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { formatMoney } from '@/hooks/useStorefront';
import { formatStorefrontOrderDate } from '@/lib/storefrontOrders';
import { usePageTitle } from '@/hooks/usePageTitle';

// ── Tracking steps in order ──────────────────────────────────────────────────
const TRACKING_STEPS: { key: string; label: string }[] = [
  { key: 'جديد',         label: 'استلام الطلب' },
  { key: 'قيد المراجعة', label: 'قيد المراجعة' },
  { key: 'تم التأكيد',   label: 'تم التأكيد'   },
  { key: 'جاري الشحن',   label: 'جاري الشحن'   },
  { key: 'تم التوصيل',   label: 'تم التوصيل'   },
];

// Maps every possible status to its step index (negative = cancelled/refunded)
// Uses Arabic values to match the admin dashboard (DarAlfath_Dash)
const STATUS_INDEX: Record<string, number> = {
  // Arabic (admin values)
  'جديد':         0,
  'قيد المراجعة': 1,
  'تم التأكيد':   2,
  'جاري الشحن':   3,
  'تم التوصيل':   4,
  'ملغي':         -1,
  'مرتجع':        -1,
  // English fallback (legacy)
  pending:    0,
  confirmed:  2,
  processing: 1,
  shipped:    3,
  delivered:  4,
  completed:  4,
  cancelled:  -1,
  refunded:   -1,
};

const ORDER_STATUS_CHIP: Record<string, { label: string; color: string }> = {
  // Arabic (admin values)
  'جديد':         { label: 'جديد',           color: 'status-chip--pending' },
  'قيد المراجعة': { label: 'قيد المراجعة',   color: 'status-chip--processing' },
  'تم التأكيد':   { label: 'تم التأكيد',     color: 'status-chip--confirmed' },
  'جاري الشحن':   { label: 'جاري الشحن',     color: 'status-chip--shipped' },
  'تم التوصيل':   { label: 'تم التوصيل',     color: 'status-chip--delivered' },
  'ملغي':         { label: 'ملغي',            color: 'status-chip--cancelled' },
  'مرتجع':        { label: 'مرتجع',           color: 'status-chip--cancelled' },
  // English fallback
  pending:        { label: 'قيد الانتظار',   color: 'status-chip--pending' },
  confirmed:      { label: 'تم التأكيد',      color: 'status-chip--confirmed' },
  processing:     { label: 'جاري التجهيز',   color: 'status-chip--processing' },
  shipped:        { label: 'تم الشحن',        color: 'status-chip--shipped' },
  delivered:      { label: 'تم التوصيل',     color: 'status-chip--delivered' },
  cancelled:      { label: 'ملغي',            color: 'status-chip--cancelled' },
  refunded:       { label: 'مرتجع',           color: 'status-chip--cancelled' },
};

function getOrderChip(raw?: string) {
  if (!raw) return { label: 'قيد الانتظار', color: 'status-chip--pending' };
  return ORDER_STATUS_CHIP[raw] ?? { label: raw, color: 'status-chip--pending' };
}

function OrderTrackingBar({ status }: { status?: string }) {
  const isCancelled = status === 'ملغي' || status === 'مرتجع' || status === 'cancelled' || status === 'refunded';
  const currentIdx  = STATUS_INDEX[status ?? 'جديد'] ?? 0;

  if (isCancelled) {
    return (
      <div className="tracking-bar tracking-bar--cancelled">
        <span>{status === 'مرتجع' ? 'تم إرجاع هذا الطلب' : 'تم إلغاء هذا الطلب'}</span>
      </div>
    );
  }

  return (
    <div className="tracking-bar">
      {TRACKING_STEPS.map((step, idx) => {
        const done    = idx < currentIdx;
        const active  = idx === currentIdx;
        return (
          <div key={step.key} className={`tracking-step${done ? ' done' : ''}${active ? ' active' : ''}`}>
            <div className="tracking-step__icon">
              {done   ? <CheckCircle2 size={16} /> :
               active ? <CircleDot    size={16} /> :
                        <Circle       size={16} />}
            </div>
            <span className="tracking-step__label">{step.label}</span>
            {idx < TRACKING_STEPS.length - 1 && (
              <div className={`tracking-step__line${done ? ' done' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrdersPage() {
  usePageTitle('طلباتي');
  const { user } = useAuth();
  const { data: orders = [], isLoading, isError, error } = useCustomerOrders();

  return (
    <div className="page-sections">
      <section className="page-card">
        <div className="page-card__head">
          <div>
            <span className="page-kicker">طلباتي</span>
            <h1>سجل الطلبات</h1>
            <p>كل طلب تؤكده يظهر هنا من قاعدة البيانات، وتحديث الحالة يصل مباشرة من لوحة التحكم.</p>
          </div>
          <div className="orders-summary-pill">
            <ReceiptText size={16} />
            {orders.length} طلب
          </div>
        </div>

        {!user ? (
          <div className="empty-state">
            <ClipboardList size={28} />
            <h3>سجّل الدخول لمتابعة الطلبات</h3>
            <p>طلباتك مرتبطة بحسابك حتى تظهر تحديثات لوحة التحكم أولًا بأول.</p>
            <Link to="/account" className="primary-button">تسجيل الدخول</Link>
          </div>
        ) : isLoading ? (
          <section className="page-card page-card--loading" />
        ) : isError ? (
          <div className="empty-state">
            <ClipboardList size={28} />
            <h3>تعذر تحميل الطلبات</h3>
            <p>{error instanceof Error ? error.message : 'راجع سياسات RLS في Supabase لجدول orders.'}</p>
          </div>
        ) : orders.length ? (
          <div className="order-history">
            {orders.map((order) => {
              const currency = order.countries?.currency_symbol || 'ج.م';
              const address  = order.shipping_address;
              const { label: chipLabel, color: chipColor } = getOrderChip(order.status);

              return (
                <article className="order-card" key={order.id}>

                  {/* ── رأس الكارت ─────────────────────────────────── */}
                  <div className="order-card__head">
                    <div>
                      <span className="order-card__id">{order.id}</span>
                      <h3>{address?.name || user.email || 'عميل دار الفتح'}</h3>
                      <p>{formatStorefrontOrderDate(order.created_at)}</p>
                    </div>
                    <span className={`status-chip ${chipColor}`}>
                      <CircleDot size={13} />
                      {chipLabel}
                    </span>
                  </div>

                  {/* ── شريط تتبع الطلب ────────────────────────────── */}
                  <OrderTrackingBar status={order.status} />

                  {/* ── بيانات سريعة ───────────────────────────────── */}
                  <div className="order-card__meta">
                    <div>
                      <span>طريقة الدفع</span>
                      <b>{order.payment_methods?.method_name || '—'}</b>
                    </div>
                    <div>
                      <span>العنوان</span>
                      <b>{[address?.governorate, address?.city, address?.street].filter(Boolean).join(' - ') || 'غير محدد'}</b>
                    </div>
                    <div>
                      <span>الإجمالي</span>
                      <b>{formatMoney(order.total_price, currency)}</b>
                    </div>
                  </div>

                  {/* ── رقم التتبع وشركة الشحن إن وُجدا ──────────── */}
                  {(order.tracking_number || order.shipping_companies?.company_name) ? (
                    <div className="details-note details-note--soft">
                      {order.shipping_companies?.company_name ? (
                        <span>شركة الشحن: <b>{order.shipping_companies.company_name}</b>{order.tracking_number ? ' — ' : ''}</span>
                      ) : null}
                      {order.tracking_number ? (
                        <span>رقم التتبع: <b>{order.tracking_number}</b></span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* ── محتويات الطلب ──────────────────────────────── */}
                  <div className="order-items">
                    {(order.order_items ?? []).map((item) => (
                      <Link to={`/book/${item.product_id}`} className="order-item-row" key={item.id}>
                        <span>{item.products?.title || 'منتج'}</span>
                        <small>{item.product_variants?.variant_name || 'نسخة'} × {item.quantity}</small>
                        <b>{formatMoney((item.price_per_item - item.discount_per_item) * item.quantity, currency)}</b>
                      </Link>
                    ))}
                  </div>

                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <ClipboardList size={28} />
            <h3>لا توجد طلبات بعد</h3>
            <p>أكمل أول طلب من السلة وسيظهر هنا تلقائيًا من قاعدة البيانات.</p>
            <Link to="/books" className="primary-button">
              <Truck size={16} />
              ابدأ التسوق
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
