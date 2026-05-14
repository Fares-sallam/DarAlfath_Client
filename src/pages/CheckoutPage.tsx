import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CreditCard, PackageCheck, Truck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCountry } from '@/contexts/CountryContext';
import { formatMoney, usePaymentMethods } from '@/hooks/useStorefront';
import { supabase } from '@/lib/supabase';
import {
  createStorefrontOrder,
  formatStorefrontOrderDate,
  type StorefrontOrder,
} from '@/lib/storefrontOrders';

type CheckoutForm = {
  fullName: string;
  email: string;
  phone: string;
  governorate: string;   // محافظة — مطلوبة للوحة التحكم
  city: string;
  address: string;
  notes: string;
};

export default function CheckoutPage() {
  usePageTitle('إتمام الطلب');
  const queryClient = useQueryClient();
  const { items, subtotal, shipping, total, currencySymbol, clearCart } = useCart();
  const { user } = useAuth();
  const { selectedCountry } = useCountry();
  const { data: paymentMethods = [] } = usePaymentMethods();

  const [form, setForm] = useState<CheckoutForm>({
    fullName: '',
    email: user?.email ?? '',
    phone: '',
    governorate: '',
    city: '',
    address: '',
    notes: '',
  });

  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (paymentMethods.length > 0 && !selectedPaymentId) {
      setSelectedPaymentId(paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPaymentId]);

  const [submitted, setSubmitted] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<StorefrontOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!user?.email) return;
    setForm((prev) => (prev.email ? prev : { ...prev, email: user.email ?? '' }));
  }, [user?.email]);

  const canSubmit = useMemo(() => {
    return Boolean(
      items.length > 0 &&
      selectedPaymentId &&
      form.fullName.trim() &&
      form.email.trim() &&
      form.phone.trim() &&
      form.governorate.trim() &&
      form.city.trim() &&
      form.address.trim()
    );
  }, [items.length, selectedPaymentId, form]);

  const updateField = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectedMethod = useMemo(
    () => paymentMethods.find((m) => m.id === selectedPaymentId) ?? null,
    [paymentMethods, selectedPaymentId]
  );

  const isPaymob = selectedMethod?.provider?.toLowerCase().startsWith('paymob') ?? false;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const order = await createStorefrontOrder({
        customer: {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          governorate: form.governorate,
          city: form.city,
          address: form.address,
          notes: form.notes,
        },
        paymentMethod: isPaymob ? 'online' as never : 'cod',
        paymentMethodId: selectedPaymentId,
        country: selectedCountry,
        items,
        shipping,
        // Paymob: لا يخصم مخزون الآن — يُخصم بعد تأكيد الدفع عبر Webhook
        paymentType: isPaymob ? 'online' : 'cod',
      });

      // ── Paymob online payment ────────────────────────────────────────────────
      if (isPaymob && selectedMethod) {
        const nameParts = form.fullName.trim().split(' ');
        const firstName = nameParts[0] || 'N/A';
        const lastName = nameParts.slice(1).join(' ') || 'N/A';

        const billingData = {
          first_name: firstName,
          last_name: lastName,
          email: form.email.trim(),
          phone_number: form.phone.trim(),
          country: selectedCountry?.code || 'EG',
          state: form.governorate.trim() || 'N/A',
          city: form.city.trim() || 'N/A',
          street: form.address.trim() || 'N/A',
          building: 'N/A',
          floor: 'N/A',
          apartment: 'N/A',
        };

        const { data, error } = await supabase.functions.invoke('initiate-paymob-payment', {
          body: {
            orderId: order.id,
            amountCents: Math.round(total * 100),
            billingData,
            provider: selectedMethod.provider.toLowerCase(),
          },
        });

        if (error || !data?.paymentUrl) {
          // استخراج رسالة الخطأ التفصيلية من الـ Edge Function
          let errorMsg = 'تعذر بدء عملية الدفع عبر Paymob.';
          if (error) {
            const ctx = (error as { context?: Response }).context;
            if (ctx) {
              try {
                const details = await ctx.clone().json();
                if (typeof details?.error === 'string' && details.error.trim()) {
                  errorMsg = details.error;
                }
              } catch { /* ignore */ }
            } else if (error.message) {
              errorMsg = error.message;
            }
          } else if (data?.error) {
            errorMsg = data.error;
          }
          throw new Error(errorMsg);
        }

        clearCart();
        // حفظ رقم الطلب مؤقتاً — تستخدمه صفحة النتيجة لإلغاء الطلب عند الفشل
        sessionStorage.setItem('paymob_pending_order_id', order.id);
        window.location.href = data.paymentUrl;
        return;
      }

      // ── Cash / COD ───────────────────────────────────────────────────────────
      setSubmittedOrder(order);
      setSubmitted(true);
      clearCart();

      void queryClient.invalidateQueries({ queryKey: ['product-variants-public'] });
      void queryClient.invalidateQueries({ queryKey: ['products-public-catalog'] });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'تعذر إرسال الطلب إلى قاعدة البيانات.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="page-sections">
        <section className="page-card">
          <div className="empty-state">
            <CheckCircle2 size={30} />
            <h3>تم إرسال الطلب بنجاح</h3>
            {submittedOrder ? (
              <div className="checkout-confirmation">
                <div>
                  <span>رقم الطلب</span>
                  <b>{submittedOrder.id}</b>
                </div>
                <div>
                  <span>تاريخ الطلب</span>
                  <b>{formatStorefrontOrderDate(submittedOrder.created_at)}</b>
                </div>
                <div>
                  <span>الإجمالي</span>
                  <b>{formatMoney(submittedOrder.total_price, submittedOrder.countries?.currency_symbol || currencySymbol)}</b>
                </div>
              </div>
            ) : null}
            <p>تم تسجيل الطلب وسيظهر في لوحة التحكم وصفحة طلباتي خلال ثوانٍ.</p>
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
        <div className="page-card__head">
          <div>
            <span className="page-kicker">إتمام الطلب</span>
            <h1>مراجعة البيانات والدفع</h1>
            <p>أدخل بياناتك ثم راجع الطلب قبل الإرسال.</p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <CreditCard size={24} />
            <h3>لا يوجد شيء لإتمامه</h3>
            <p>السلة فارغة حاليًا. أضف كتبًا أولًا ثم ارجع إلى صفحة الدفع.</p>
            <Link to="/books" className="primary-button">الذهاب إلى الكتب</Link>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="contact-form">

              {/* ── بيانات العميل ─────────────────────────────────── */}
              <div className="contact-card">
                <h3>بيانات العميل</h3>

                <input
                  value={form.fullName}
                  onChange={(e) => updateField('fullName', e.target.value)}
                  placeholder="الاسم الكامل *"
                  autoComplete="name"
                />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="البريد الإلكتروني *"
                  autoComplete="email"
                />
                <input
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="رقم الهاتف *"
                  autoComplete="tel"
                />
              </div>

              {/* ── عنوان الشحن ───────────────────────────────────── */}
              <div className="contact-card">
                <h3>عنوان الشحن</h3>

                <input
                  value={form.governorate}
                  onChange={(e) => updateField('governorate', e.target.value)}
                  placeholder="المحافظة *"
                  autoComplete="address-level1"
                />
                <input
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="المدينة / الحي *"
                  autoComplete="address-level2"
                />
                <input
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="الشارع والعنوان بالتفصيل *"
                  autoComplete="street-address"
                />
                <textarea
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="ملاحظات إضافية (اختياري)"
                />
              </div>

              {/* ── طريقة الدفع ───────────────────────────────────── */}
              <div className="contact-card">
                <h3>طريقة الدفع</h3>

                {paymentMethods.length === 0 ? (
                  <p style={{ opacity: 0.5, fontSize: '0.9rem' }}>جاري تحميل طرق الدفع...</p>
                ) : (
                  <div className="variant-selector__grid">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        className={selectedPaymentId === method.id ? 'variant-pill active' : 'variant-pill'}
                        onClick={() => setSelectedPaymentId(method.id)}
                      >
                        <span>{method.method_name}</span>
                        <small>{selectedPaymentId === method.id ? 'محدد الآن' : method.provider.startsWith('paymob') ? 'Paymob' : method.provider}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── ملخص الطلب ────────────────────────────────────── */}
            <aside className="order-summary">
              <h3>ملخص الطلب</h3>

              {items.map((item) => (
                <div key={item.key}>
                  <span>{item.title} - {item.variant_name} × {item.quantity}</span>
                  <b>{formatMoney(item.price * item.quantity, item.currency_symbol)}</b>
                </div>
              ))}

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

              <div className="availability-chip">
                <Truck size={14} />
                الشحن يُحسب للكتب الورقية فقط
              </div>

              {submitError ? (
                <div className="auth-alert auth-alert--error">{submitError}</div>
              ) : null}

              <button
                type="button"
                className="primary-button primary-button--full"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
              >
                {submitting
                  ? (isPaymob ? 'جاري التحويل لبوابة الدفع...' : 'جاري تسجيل الطلب...')
                  : (isPaymob ? 'الدفع عبر Paymob' : 'تأكيد الطلب')}
              </button>

              <Link to="/cart" className="ghost-button ghost-button--full">
                الرجوع إلى السلة
              </Link>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
