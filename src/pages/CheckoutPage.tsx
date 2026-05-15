import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CreditCard, PackageCheck, Tag, Truck, X } from 'lucide-react';
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

  // ── Coupon state ──────────────────────────────────────────
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    couponId: string;
    code: string;
    type: string;
    value: number;
    calculatedAmount: number;
    freeShipping: boolean;
    description: string;
  } | null>(null);

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

  // ── Adjusted totals (with coupon) ─────────────────────────
  const adjustedShipping = appliedCoupon?.freeShipping ? 0 : shipping;
  const discountAmount = appliedCoupon?.calculatedAmount ?? 0;
  const adjustedTotal = Math.max(0, subtotal - discountAmount + adjustedShipping);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');

    try {
      const trimmedCode = couponCode.trim().toUpperCase();

      // ── 1. اقرأ الكوبون من قاعدة البيانات مباشرة (RLS بيسمح بقراءة النشطة فقط) ──
      const { data: coupon, error: fetchErr } = await supabase
        .from('coupons')
        .select('id, code, type, value, min_order, max_uses, used_count, product_id, country_id, user_id, valid_from, valid_to, is_active')
        .eq('code', trimmedCode)
        .eq('is_active', true)
        .maybeSingle();

      if (fetchErr) {
        console.error('[coupon] fetch error:', fetchErr);
        setCouponError('تعذر التحقق من كود الخصم. حاول مرة أخرى.');
        return;
      }

      if (!coupon) {
        setCouponError('كود الخصم غير صالح.');
        return;
      }

      // ── 2. منطق التحقق (نفس اللي في الـ Edge Function) ──────
      const now = new Date();
      if (coupon.valid_from && now < new Date(coupon.valid_from)) {
        setCouponError('كود الخصم لم يبدأ بعد.');
        return;
      }
      if (coupon.valid_to && now > new Date(coupon.valid_to)) {
        setCouponError('كود الخصم منتهي الصلاحية.');
        return;
      }
      if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
        setCouponError('كود الخصم وصل للحد الأقصى من الاستخدام.');
        return;
      }
      if (coupon.min_order != null && coupon.min_order > 0 && subtotal < coupon.min_order) {
        setCouponError(`الحد الأدنى للطلب ${coupon.min_order} ${currencySymbol} للاستفادة من هذا الكود.`);
        return;
      }
      if (coupon.country_id && coupon.country_id !== (selectedCountry?.id ?? null)) {
        setCouponError('كود الخصم غير متاح لبلدك.');
        return;
      }
      if (coupon.user_id && coupon.user_id !== (user?.id ?? null)) {
        setCouponError('كود الخصم مخصص لمستخدم آخر.');
        return;
      }
      if (coupon.product_id && !items.some((i) => i.product_id === coupon.product_id)) {
        setCouponError('كود الخصم خاص بمنتج غير موجود في سلتك.');
        return;
      }

      // ── 3. حساب الخصم ──────────────────────────────────────
      let calculatedAmount = 0;
      let freeShipping = false;
      let description = '';

      switch (coupon.type) {
        case 'نسبة':
          calculatedAmount = Math.round((subtotal * coupon.value / 100) * 100) / 100;
          description = `خصم ${coupon.value}%`;
          break;
        case 'مبلغ ثابت':
          calculatedAmount = Math.min(coupon.value, subtotal);
          description = `خصم ${coupon.value} ${currencySymbol}`;
          break;
        case 'شحن مجاني':
          freeShipping = true;
          calculatedAmount = Number(shipping) || 0;
          description = 'شحن مجاني';
          break;
        case 'خصم منتج': {
          const match = items.find((i) => i.product_id === coupon.product_id);
          if (match) {
            const lineTotal = match.price * match.quantity;
            calculatedAmount = Math.min(coupon.value, lineTotal);
          }
          description = 'خصم على المنتج';
          break;
        }
        default:
          setCouponError('نوع الكوبون غير مدعوم.');
          return;
      }

      setAppliedCoupon({
        couponId: coupon.id,
        code: trimmedCode,
        type: coupon.type,
        value: coupon.value,
        calculatedAmount,
        freeShipping,
        description,
      });
      setCouponError('');
    } catch (err) {
      console.error('[coupon] unexpected error:', err);
      setCouponError('حدث خطأ غير متوقع. حاول مرة أخرى.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  };

  // Clear coupon when cart/country changes
  useEffect(() => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  }, [subtotal, items.length, selectedCountry?.id]);

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
        couponCode: appliedCoupon?.code || undefined,
      });

      // ── Apply coupon to order (server-side validation + update) ──────────────
      console.log('[checkout] BUILD v3 — appliedCoupon=', appliedCoupon, 'order.id=', order?.id);
      if (appliedCoupon?.code && order?.id) {
        try {
          console.log('[checkout] calling apply_coupon_to_order RPC...');
          const { data: couponResult, error: couponRpcError } = await supabase.rpc(
            'apply_coupon_to_order',
            { p_order_id: order.id, p_coupon_code: appliedCoupon.code },
          );
          console.log('[checkout] RPC response:', { data: couponResult, error: couponRpcError });

          if (couponRpcError) {
            console.error('[checkout] RPC error:', couponRpcError);
          } else if (couponResult && couponResult.success === false) {
            console.warn('[checkout] coupon rejected by server:', couponResult.error);
          } else if (couponResult?.success === true) {
            console.log('[checkout] ✅ coupon applied:', couponResult);
            // Update local order so the success screen shows the discounted total
            order.discount_amount = Number(couponResult.discount_amount) || 0;
            order.shipping_cost = Number(couponResult.shipping_cost) || order.shipping_cost;
            order.total_price = Number(couponResult.total_price) || order.total_price;
          }
        } catch (rpcErr) {
          console.error('[checkout] RPC exception:', rpcErr);
        }
      } else {
        console.log('[checkout] no coupon to apply or order.id missing');
      }

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
            amountCents: Math.round(adjustedTotal * 100),
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

              {/* ── كود الخصم ──────────────────────────────────── */}
              <div className="contact-card">
                <h3><Tag size={16} /> كود الخصم</h3>

                {appliedCoupon ? (
                  <div className="coupon-applied">
                    <div className="coupon-applied__info">
                      <span className="coupon-applied__code">{appliedCoupon.code}</span>
                      <span className="coupon-applied__desc">{appliedCoupon.description}</span>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={handleRemoveCoupon}
                      aria-label="إزالة الكوبون"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="coupon-input-row">
                      <input
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="أدخل كود الخصم"
                        disabled={couponLoading}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApplyCoupon();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleApplyCoupon}
                        disabled={couponLoading || !couponCode.trim()}
                      >
                        {couponLoading ? 'جاري التحقق...' : 'تطبيق'}
                      </button>
                    </div>
                    {couponError ? (
                      <div className="auth-alert auth-alert--error" style={{ marginTop: 8 }}>
                        {couponError}
                      </div>
                    ) : null}
                  </>
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

              {appliedCoupon && discountAmount > 0 ? (
                <div className="order-summary__discount">
                  <span>الخصم ({appliedCoupon.description})</span>
                  <b>- {formatMoney(discountAmount, currencySymbol)}</b>
                </div>
              ) : null}

              <div>
                <span>الشحن</span>
                <b>
                  {appliedCoupon?.freeShipping && shipping > 0 ? (
                    <>
                      <s style={{ opacity: 0.4, marginLeft: 6 }}>{formatMoney(shipping, currencySymbol)}</s>
                      {' '}مجاني
                    </>
                  ) : (
                    formatMoney(adjustedShipping, currencySymbol)
                  )}
                </b>
              </div>
              <div className="order-summary__total">
                <span>الإجمالي النهائي</span>
                <b>{formatMoney(adjustedTotal, currencySymbol)}</b>
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
