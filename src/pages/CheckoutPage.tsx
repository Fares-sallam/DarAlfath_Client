import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CreditCard, ExternalLink, Loader2, PackageCheck, Tag, Truck, X } from 'lucide-react';
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

  // Paymob polling state ──────────────────────────────────────────
  const [paymobPolling, setPaymobPolling] = useState(false);
  const [paymobMerchantOrderId, setPaymobMerchantOrderId] = useState<string | null>(null);
  const [paymobPaymentUrl, setPaymobPaymentUrl] = useState<string | null>(null);
  const [paymobStatusMsg, setPaymobStatusMsg] = useState<string>('جارٍ إنتظار تأكيد الدفع...');
  const pollAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });

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

  // Diagnostic: list the missing fields so the user knows exactly what's wrong
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (items.length === 0) missing.push('السلة فارغة');
    if (!selectedPaymentId) missing.push('طريقة الدفع');
    if (!form.fullName.trim()) missing.push('الاسم الكامل');
    if (!form.email.trim()) missing.push('البريد الإلكتروني');
    if (!form.phone.trim()) missing.push('رقم الهاتف');
    if (!form.governorate.trim()) missing.push('المحافظة');
    if (!form.city.trim()) missing.push('المدينة');
    if (!form.address.trim()) missing.push('العنوان');
    return missing;
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
  // For "شحن مجاني" coupon: the saving IS the shipping cost; we zero shipping
  // and skip subtracting calculatedAmount from subtotal (would be a double deduction).
  // For other coupon types: subtract calculatedAmount from subtotal as a normal discount.
  const adjustedShipping = appliedCoupon?.freeShipping ? 0 : shipping;
  const subtotalDiscount = appliedCoupon && !appliedCoupon.freeShipping
    ? (appliedCoupon.calculatedAmount ?? 0)
    : 0;
  const discountAmount = appliedCoupon?.calculatedAmount ?? 0; // كده الـ UI يقدر يعرض قيمة الخصم سواء كان شحن أو مبلغ
  const adjustedTotal = Math.max(0, subtotal - subtotalDiscount + adjustedShipping);

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

  // ── Polling Paymob until terminal state ──────────────────────────
  const pollPaymobTransaction = async (merchantOrderId: string) => {
    const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes
    const INTERVAL_MS = 3000;
    const startedAt = Date.now();
    pollAbortRef.current = { cancelled: false };

    while (!pollAbortRef.current.cancelled) {
      if (Date.now() - startedAt > MAX_DURATION_MS) {
        // Timeout — cancel pending payment to release stock
        try {
          await supabase.functions.invoke('check-paymob-transaction', {
            body: { merchantOrderId },
          });
        } catch { /* ignore */ }
        setSubmitError('انتهت مهلة انتظار تأكيد الدفع. حاول مرة أخرى.');
        setPaymobPolling(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('check-paymob-transaction', {
          body: { merchantOrderId },
        });

        if (!error && data) {
          if (data.status === 'success') {
            // Payment confirmed — fetch the order details to show success
            const { data: orderRow } = await supabase
              .from('orders')
              .select(`
                id, total_price, shipping_cost, discount_amount, payment_status,
                created_at,
                countries(name, currency_symbol)
              `)
              .eq('id', data.orderId)
              .maybeSingle();

            setSubmittedOrder(orderRow as unknown as StorefrontOrder);
            setSubmitted(true);
            setPaymobPolling(false);
            clearCart();
            void queryClient.invalidateQueries({ queryKey: ['product-variants-public'] });
            void queryClient.invalidateQueries({ queryKey: ['products-public-catalog'] });
            return;
          }

          if (data.status === 'failed') {
            // Payment failed — release stock, keep cart, show error
            setSubmitError(data.error || 'فشل الدفع. حاول مرة أخرى أو اختر طريقة دفع أخرى.');
            setPaymobPolling(false);
            return;
          }

          if (data.status === 'error' || data.status === 'not_found') {
            setSubmitError(data.error || 'تعذر التحقق من حالة الدفع.');
            setPaymobPolling(false);
            return;
          }

          // status === 'pending' — keep polling
          setPaymobStatusMsg('جارٍ إنتظار تأكيد الدفع من Paymob...');
        }
      } catch (e) {
        console.warn('[checkout] poll exception:', e);
      }

      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  };

  const handleCancelPaymobPolling = async () => {
    pollAbortRef.current.cancelled = true;
    setPaymobPolling(false);
    if (paymobMerchantOrderId) {
      try {
        // Release stock by cancelling the pending payment
        await supabase.functions.invoke('check-paymob-transaction', {
          body: { merchantOrderId: paymobMerchantOrderId },
        });
      } catch { /* ignore */ }
    }
    setSubmitError('تم إلغاء عملية الدفع. الكتب لا تزال في سلتك.');
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      // ═══════════════════════════════════════════════════════════════
      //  FORK A — Paymob (online): do NOT create an order yet.
      //  The Edge Function creates a `pending_payments` record + reserves
      //  stock. The real `orders` row is only created after the polling
      //  function confirms a successful transaction.
      // ═══════════════════════════════════════════════════════════════
      if (isPaymob && selectedMethod) {
        const { data, error } = await supabase.functions.invoke('initiate-paymob-payment', {
          body: {
            provider:        selectedMethod.provider.toLowerCase(),
            paymentMethodId: selectedPaymentId,
            customer: {
              fullName:    form.fullName,
              email:       form.email,
              phone:       form.phone,
              governorate: form.governorate,
              city:        form.city,
              address:     form.address,
              notes:       form.notes,
            },
            country:    selectedCountry,
            shipping,
            items: items.map((i) => ({
              product_id: i.product_id,
              variant_id: i.variant_id,
              quantity:   i.quantity,
              is_digital: i.is_digital,
            })),
            couponCode: appliedCoupon?.code || null,
          },
        });

        if (error || !data?.paymentUrl || !data?.merchantOrderId) {
          let errMsg = 'تعذر بدء عملية الدفع عبر Paymob.';
          const ctx = (error as { context?: Response } | null)?.context;
          if (ctx) {
            try {
              const details = await ctx.clone().json();
              if (typeof details?.error === 'string' && details.error.trim()) {
                errMsg = details.error;
              }
            } catch { /* ignore */ }
          } else if (error?.message) {
            errMsg = error.message;
          } else if (data?.error) {
            errMsg = data.error;
          }
          throw new Error(errMsg);
        }

        // Open Paymob in a new tab, start polling, show modal in the current tab
        setPaymobMerchantOrderId(data.merchantOrderId);
        setPaymobPaymentUrl(data.paymentUrl);
        setPaymobPolling(true);
        setSubmitting(false);
        setPaymobStatusMsg('فتحنا نافذة الدفع في تبويب جديد. أكمل الدفع هناك...');

        // Open Paymob payment page in a new tab
        window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');

        // Begin polling (runs in background)
        void pollPaymobTransaction(data.merchantOrderId);
        return;
      }

      // ═══════════════════════════════════════════════════════════════
      //  FORK B — COD (cash on delivery): create the order immediately.
      // ═══════════════════════════════════════════════════════════════
      const order = await createStorefrontOrder({
        customer: {
          fullName:    form.fullName,
          email:       form.email,
          phone:       form.phone,
          governorate: form.governorate,
          city:        form.city,
          address:     form.address,
          notes:       form.notes,
        },
        paymentMethod:   'cod',
        paymentMethodId: selectedPaymentId,
        country:         selectedCountry,
        items,
        shipping,
        paymentType:     'cod',
        couponCode:      appliedCoupon?.code || undefined,
      });

      // Apply coupon server-side (RPC) for COD orders
      if (appliedCoupon?.code && order?.id) {
        try {
          await supabase.rpc('apply_coupon_to_order', {
            p_order_id:    order.id,
            p_coupon_code: appliedCoupon.code,
          });
        } catch (e) {
          console.warn('[checkout] coupon apply failed (non-fatal):', e);
        }
      }

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

              {!canSubmit && missingFields.length > 0 ? (
                <div className="auth-alert auth-alert--warning" style={{ fontSize: '0.85rem' }}>
                  أكمل البيانات التالية أولاً: {missingFields.join('، ')}
                </div>
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

      {/* ── Paymob polling modal ─────────────────────────────────── */}
      {paymobPolling && (
        <div className="paymob-modal-backdrop" role="dialog" aria-modal="true">
          <div className="paymob-modal">
            <Loader2 size={42} className="paymob-modal__spinner" />
            <h3>جارٍ تأكيد عملية الدفع</h3>
            <p>{paymobStatusMsg}</p>
            {paymobPaymentUrl && (
              <a
                href={paymobPaymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ghost-button paymob-modal__open"
              >
                <ExternalLink size={14} />
                إعادة فتح نافذة الدفع
              </a>
            )}
            <p className="paymob-modal__hint">
              لا تغلق هذه الصفحة. سنحدّث الحالة فور تأكيد Paymob للعملية.
            </p>
            <button
              type="button"
              className="ghost-button paymob-modal__cancel"
              onClick={handleCancelPaymobPolling}
            >
              <X size={14} />
              إلغاء عملية الدفع
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
