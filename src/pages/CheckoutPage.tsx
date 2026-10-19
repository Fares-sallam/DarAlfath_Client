import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, CreditCard, ExternalLink, Loader2, LogIn, PackageCheck, Phone, Tag, Truck, UserRound, X, Zap } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { OrnamentDivider } from '@/components/Ornament';
import TurnstileWidget, { TURNSTILE_SITE_KEY, type TurnstileHandle } from '@/components/TurnstileWidget';
import { usePrivateSeo } from '@/hooks/useSeo';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCountry } from '@/contexts/CountryContext';
import { formatMoney, usePaymentMethods, useStoreSettings, useShippingRate } from '@/hooks/useStorefront';
import { isApplePaySupported } from '@/lib/applePay';
import { supabase } from '@/lib/supabase';
import {
  EMPTY_CHECKOUT,
  firstIncompleteStep,
  normalizePhone,
  stepErrors,
  type CheckoutForm,
  type CheckoutStep,
} from '@/lib/checkout';
import {
  createStorefrontOrder,
  formatStorefrontOrderDate,
  type StorefrontOrder,
} from '@/lib/storefrontOrders';

// ── بيانات المحافظات والمدن المصرية ───────────────────────────────────────
const EGYPT_REGIONS: Record<string, string[]> = {
  'القاهرة':       ['القاهرة', 'مدينة نصر', 'هليوبوليس', 'المعادي', 'الزيتون', 'شبرا', 'عين شمس', 'المطرية', 'التجمع الخامس', 'مدينة بدر', 'المقطم', 'السلام', 'الخليفة'],
  'الجيزة':        ['الجيزة', 'الهرم', 'الدقي', 'المهندسين', 'العجوزة', 'الشيخ زايد', '6 أكتوبر', 'الوراق', 'إمبابة', 'منشأة القناطر', 'البدرشين', 'الصف', 'أطفيح'],
  'الإسكندرية':   ['الإسكندرية', 'سيدي جابر', 'العجمي', 'المنتزه', 'سموحة', 'محرم بك', 'الرمل', 'العامرية', 'برج العرب', 'أبو قير'],
  'الدقهلية':     ['المنصورة', 'طلخا', 'ميت غمر', 'دكرنس', 'أجا', 'بلقاس', 'منية النصر', 'نبروه', 'السنبلاوين', 'شربين', 'المنزلة', 'تمي الأمديد'],
  'الشرقية':      ['الزقازيق', 'العاشر من رمضان', 'بلبيس', 'ديرب نجم', 'الإبراهيمية', 'منيا القمح', 'أبو حماد', 'القنايات', 'فاقوس', 'أبو كبير', 'هيهيا', 'مشتول السوق'],
  'القليوبية':    ['بنها', 'قليوب', 'شبرا الخيمة', 'القناطر الخيرية', 'الخانكة', 'كفر شكر', 'طوخ', 'الخصوص'],
  'الغربية':      ['طنطا', 'المحلة الكبرى', 'كفر الزيات', 'زفتى', 'السنطة', 'بسيون', 'سمنود'],
  'المنوفية':     ['شبين الكوم', 'مينوف', 'أشمون', 'الباجور', 'قويسنا', 'بركة السبع', 'السادات', 'تلا'],
  'كفر الشيخ':   ['كفر الشيخ', 'دسوق', 'فوه', 'قلين', 'بيلا', 'الحامول', 'مطوبس', 'سيدي سالم', 'برج البرلس'],
  'البحيرة':      ['دمنهور', 'كفر الدوار', 'رشيد', 'الدلنجات', 'إيتاي البارود', 'أبو حمص', 'حوش عيسى', 'شبراخيت', 'المحمودية', 'وادي النطرون'],
  'الإسماعيلية': ['الإسماعيلية', 'القنطرة', 'فايد', 'القصاصين', 'التل الكبير', 'أبو صوير'],
  'السويس':       ['السويس', 'عتاقة', 'الجناين', 'فيصل'],
  'بورسعيد':     ['بورسعيد', 'بورفؤاد', 'الزهور', 'المناخ', 'الشرق', 'الضواهي'],
  'الأقصر':       ['الأقصر', 'الأرمنت', 'إسنا', 'القرنة', 'البياضية'],
  'أسوان':        ['أسوان', 'كوم أمبو', 'إدفو', 'نصر النوبة', 'أبو سمبل', 'دراو'],
  'الفيوم':       ['الفيوم', 'سنورس', 'إطسا', 'يوسف الصديق', 'طامية', 'أبشواي'],
  'بني سويف':    ['بني سويف', 'ناصر', 'الواسطى', 'إهناسيا', 'ببا', 'الفشن', 'سمسطا'],
  'المنيا':        ['المنيا', 'ملوي', 'سمالوط', 'مغاغة', 'أبو قرقاص', 'بني مزار', 'العدوة', 'مطاي'],
  'أسيوط':        ['أسيوط', 'ديروط', 'منفلوط', 'القوصية', 'أبنوب', 'أبو تيج', 'الغنايم', 'ساحل سليم'],
  'سوهاج':        ['سوهاج', 'أخميم', 'طهطا', 'جرجا', 'دار السلام', 'المراغة', 'المنشأة', 'ساقلته', 'البلينا'],
  'قنا':          ['قنا', 'نجع حمادي', 'الأقصر (قنا)', 'الوقف', 'قوص', 'أبو تشت', 'فرشوط', 'نقادة'],
  'الوادي الجديد': ['الخارجة', 'الداخلة', 'الفرافرة', 'بهارية'],
  'مطروح':        ['مرسى مطروح', 'سيوة', 'الحمام', 'الضبعة', 'العلمين', 'النجيلة'],
  'شمال سيناء':  ['العريش', 'الشيخ زويد', 'رفح', 'بئر العبد', 'نخل'],
  'جنوب سيناء':  ['شرم الشيخ', 'دهب', 'نويبع', 'طابا', 'أبو رديس', 'الطور', 'سانت كاترين'],
  'البحر الأحمر': ['الغردقة', 'سفاجا', 'القصير', 'مرسى علم', 'شلاتين'],
  'دمياط':        ['دمياط', 'رأس البر', 'الزرقا', 'فارسكور', 'كفر سعد', 'ميت أبو غالب'],
};

const GOVERNORATES = Object.keys(EGYPT_REGIONS);

const STEPS: { step: CheckoutStep; label: string }[] = [
  { step: 1, label: 'بياناتك' },
  { step: 2, label: 'الشحن والعنوان' },
  { step: 3, label: 'الدفع' },
];

/** A field's error under it, tied to the field for screen readers. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <small id={id} className="checkout-field__error">{message}</small>;
}

/**
 * Checkout in three steps, with or without an account: 1) name, mobile and (if wanted) email; 2) the
 * shipping address; 3) payment. Each step is checked before the next, and going back keeps what was typed.
 * The order summary stays beside them throughout. A signed-in customer's name and number are filled in
 * from the account. Digital books need an account (they're downloaded from it), so a cart with one asks
 * to sign in first.
 */
export default function CheckoutPage() {
  usePrivateSeo('إتمام الطلب', '/checkout');
  const queryClient = useQueryClient();
  const {
    items, subtotal, shipping: flatShipping, currencySymbol,
    clearCart, unavailableRemoved, cartWeightKg,
  } = useCart();
  const { user } = useAuth();
  const { selectedCountry } = useCountry();
  const { data: paymentMethods = [], isLoading: methodsLoading } = usePaymentMethods();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const wantsExpress = searchParams.get('express') === 'applepay';
  const { data: storeSettings } = useStoreSettings();

  const [form, setForm] = useState<CheckoutForm>({ ...EMPTY_CHECKOUT, email: user?.email ?? '' });
  const [step, setStep] = useState<CheckoutStep>(1);
  const [showErrors, setShowErrors] = useState(false);
  const stepHeading = useRef<HTMLHeadingElement | null>(null);

  // A signed-in customer: the account's email, name and number, unless already typed.
  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({ ...prev, email: prev.email || user.email || '' }));
    let cancelled = false;
    void supabase
      .from('profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setForm((prev) => ({
          ...prev,
          fullName: prev.fullName || (data.full_name as string | null) || '',
          phone: prev.phone || (data.phone as string | null) || '',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // The real governorate+weight shipping quote — same lookup the server
  // runs right before actually charging (see useShippingRate). flatShipping
  // above is only ever an estimate shown before a governorate is picked, or
  // the safety-net fallback the server itself uses when no rate row covers
  // this exact (company, governorate, weight) combination.
  const { data: realShippingRate } = useShippingRate(
    storeSettings?.default_shipping_company_id,
    form.governorate,
    cartWeightKg
  );
  const shipping = flatShipping === 0 ? 0 : (realShippingRate ?? flatShipping);

  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  // Computed once per page load — Apple Pay support doesn't change mid-session.
  const [applePaySupported] = useState(isApplePaySupported);

  // الكتب الرقمية تتطلب دفعًا إلكترونيًا مؤكدًا فقط — الدفع عند الاستلام لا معنى
  // له لملف لا يُسلَّم فعليًا، وقد يمنح وصولاً مجانيًا لو أكّد الأدمن الطلب لاحقًا
  // كإجراء روتيني (نفس القاعدة المطبّقة في التطبيق).
  const hasDigitalItem = items.some((i) => i.is_digital);
  const availablePaymentMethods = useMemo(() => {
    let list = hasDigitalItem
      ? paymentMethods.filter((m) => m.provider.toLowerCase().startsWith('paymob'))
      : paymentMethods;
    if (!applePaySupported) {
      list = list.filter((m) => m.provider.toLowerCase().trim() !== 'paymob_apple_pay');
    }
    return list;
  }, [paymentMethods, hasDigitalItem, applePaySupported]);

  useEffect(() => {
    // أعد الاختيار لو مفيش طريقة مختارة، أو لو المختارة لم تعد متاحة.
    const stillValid = availablePaymentMethods.some((m) => m.id === selectedPaymentId);
    if (availablePaymentMethods.length > 0 && (!selectedPaymentId || !stillValid)) {
      setSelectedPaymentId(availablePaymentMethods[0].id);
    }
  }, [availablePaymentMethods, selectedPaymentId]);

  const selectedMethod = useMemo(
    () => availablePaymentMethods.find((m) => m.id === selectedPaymentId) ?? null,
    [availablePaymentMethods, selectedPaymentId]
  );

  const isPaymob = selectedMethod?.provider?.toLowerCase().startsWith('paymob') ?? false;

  const [submitted, setSubmitted] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<StorefrontOrder | null>(null);
  const [submittedAsGuest, setSubmittedAsGuest] = useState(false);
  const [submittedPhone, setSubmittedPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Paymob polling state ──────────────────────────────────────────
  const [paymobPolling, setPaymobPolling] = useState(false);
  const [paymobMerchantOrderId, setPaymobMerchantOrderId] = useState<string | null>(null);
  const [paymobPaymentUrl, setPaymobPaymentUrl] = useState<string | null>(null);
  const [paymobStatusMsg, setPaymobStatusMsg] = useState<string>('جارٍ إنتظار تأكيد الدفع...');
  const pollAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const paymobClientSecretRef = useRef<string>('');

  const captchaEnabled = Boolean(TURNSTILE_SITE_KEY);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [turnstileToken, setTurnstileToken] = useState('');

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

  const countryCode = selectedCountry?.code ?? null;
  const errors = stepErrors(step, form, countryCode);
  // In the one-screen form every field is on show, so every field's problem is.
  const expressErrors = { ...stepErrors(1, form, countryCode), ...stepErrors(2, form, countryCode) };
  const activeErrors = wantsExpress && applePaySupported ? expressErrors : errors;
  const digitalNeedsAccount = hasDigitalItem && !user;

  // The one-screen form ("شراء سريع" on a device that can pay with Apple Pay): the delivery details together,
  // then Apple Pay straight away. It needs Apple Pay to be offered here (an Apple device, an active Apple Pay
  // method, Egypt: Paymob takes EGP only) and a cart that can be bought now (a digital book needs an account).
  // Anything else quietly gets the usual three steps.
  const applePayMethod = paymentMethods.find((m) => m.provider.toLowerCase().trim() === 'paymob_apple_pay') ?? null;
  const inEgypt = !countryCode || countryCode.toUpperCase() === 'EG';
  const expressEligible = wantsExpress && applePaySupported && Boolean(applePayMethod) && items.length > 0 && !digitalNeedsAccount && inEgypt;
  const expressLoading = wantsExpress && applePaySupported && methodsLoading && items.length > 0;
  useEffect(() => {
    if (expressEligible && applePayMethod && selectedPaymentId !== applePayMethod.id) setSelectedPaymentId(applePayMethod.id);
  }, [expressEligible, applePayMethod, selectedPaymentId]);

  const canSubmit = Boolean(
    items.length > 0 &&
    !digitalNeedsAccount &&
    selectedPaymentId &&
    (!hasDigitalItem || isPaymob) &&
    firstIncompleteStep(form, countryCode) === 3 &&
    (!captchaEnabled || turnstileToken)
  );

  const updateField = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      // إعادة تعيين المدينة عند تغيير المحافظة
      ...(key === 'governorate' ? { city: '' } : {}),
    }));
  };

  const goTo = (next: CheckoutStep) => {
    // Forward only once every step before it is complete; back always.
    if (next > step) {
      const blocked = Math.min(next, firstIncompleteStep(form, countryCode)) as CheckoutStep;
      if (blocked < next) {
        setStep(blocked);
        setShowErrors(true);
        return;
      }
    }
    setShowErrors(false);
    setStep(next);
    requestAnimationFrame(() => stepHeading.current?.focus());
  };

  const next = () => {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      return;
    }
    goTo((step + 1) as CheckoutStep);
  };

  // مدن المحافظة المختارة
  const availableCities = EGYPT_REGIONS[form.governorate] ?? [];

  // ── Adjusted totals (with coupon) ─────────────────────────
  // For "شحن مجاني" coupon: the saving IS the shipping cost; we zero shipping
  // and skip subtracting calculatedAmount from subtotal (would be a double deduction).
  const adjustedShipping = appliedCoupon?.freeShipping ? 0 : shipping;
  const subtotalDiscount = appliedCoupon && !appliedCoupon.freeShipping
    ? (appliedCoupon.calculatedAmount ?? 0)
    : 0;
  const discountAmount = appliedCoupon?.calculatedAmount ?? 0;
  const adjustedTotal = Math.max(0, subtotal - subtotalDiscount + adjustedShipping);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');

    try {
      const trimmedCode = couponCode.trim().toUpperCase();

      // ── التحقق server-side عبر Edge Function (بدون قراءة مباشرة لجدول
      //    الكوبونات، لمنع تعداد الأكواد). نفس منطق التحقق والحساب تمامًا. ──
      const { data: result, error: fnErr } = await supabase.functions.invoke('validate-coupon', {
        body: {
          code: trimmedCode,
          subtotal,
          shipping: Number(shipping) || 0,
          countryId: selectedCountry?.id ?? null,
          items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity, price: i.price })),
        },
      });

      if (fnErr) {
        console.error('[coupon] validate error:', fnErr);
        setCouponError('تعذر التحقق من كود الخصم. حاول مرة أخرى.');
        return;
      }

      if (!result?.valid) {
        setCouponError(result?.error || 'كود الخصم غير صالح.');
        return;
      }

      setAppliedCoupon({
        couponId: result.couponId,
        code: trimmedCode,
        type: result.discount.type,
        value: result.discount.value,
        calculatedAmount: result.discount.calculatedAmount,
        freeShipping: result.discount.freeShipping,
        description: result.discount.description,
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

  // A changed cart/country invalidates an applied discount. The typed code
  // stays: this also fires while prices and country load on arrival, and
  // wiping the field then erased what the customer had just typed.
  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError('');
  }, [subtotal, items.length, selectedCountry?.id]);

  const clearPendingPaymob = () => {
    localStorage.removeItem('paymob_pending_order_id');
    localStorage.removeItem('paymob_pending_client_secret');
    paymobClientSecretRef.current = '';
  };

  /** The confirmation's details: a guest can't read the order back, so it is built from what was sent. */
  const finish = (order: StorefrontOrder | null, orderId?: string) => {
    setSubmittedOrder(
      order ?? (orderId
        ? ({ id: orderId, total_price: adjustedTotal, created_at: new Date().toISOString(), countries: null } as unknown as StorefrontOrder)
        : null)
    );
    setSubmittedAsGuest(!user);
    setSubmittedPhone(normalizePhone(form.phone));
    setSubmitted(true);
    clearCart();
    void queryClient.invalidateQueries({ queryKey: ['product-variants-public'] });
    void queryClient.invalidateQueries({ queryKey: ['catalog-variants'] });
    void queryClient.invalidateQueries({ queryKey: ['products-public-catalog'] });
  };

  // ── Polling Paymob until terminal state ──────────────────────────
  const pollPaymobTransaction = async (merchantOrderId: string) => {
    const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes
    const INTERVAL_MS = 3000;
    const startedAt = Date.now();
    pollAbortRef.current = { cancelled: false };

    while (!pollAbortRef.current.cancelled) {
      if (Date.now() - startedAt > MAX_DURATION_MS) {
        // Timeout — explicitly cancel pending payment to release reserved stock
        try {
          await supabase.functions.invoke('check-paymob-transaction', {
            body: { merchantOrderId, cancel: true, clientSecret: paymobClientSecretRef.current },
          });
        } catch { /* ignore */ }
        setSubmitError('انتهت مهلة انتظار تأكيد الدفع. حاول مرة أخرى.');
        setPaymobPolling(false);
        clearPendingPaymob();
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('check-paymob-transaction', {
          body: { merchantOrderId, clientSecret: paymobClientSecretRef.current },
        });

        if (!error && data) {
          if (data.status === 'success') {
            // A signed-in customer can read the order back; a guest can't (and gets it from what was sent).
            const { data: orderRow } = user
              ? await supabase
                .from('orders')
                .select(`
                  id, total_price, shipping_cost, discount_amount, payment_status,
                  created_at,
                  countries(name, currency_symbol)
                `)
                .eq('id', data.orderId)
                .maybeSingle()
              : { data: null };

            setPaymobPolling(false);
            clearPendingPaymob();
            finish(orderRow as unknown as StorefrontOrder | null, data.orderId);
            return;
          }

          if (data.status === 'failed') {
            clearPendingPaymob();
            setSubmitError(data.error || 'فشل الدفع. حاول مرة أخرى أو اختر طريقة دفع أخرى.');
            setPaymobPolling(false);
            return;
          }

          if (data.status === 'error' || data.status === 'not_found') {
            setSubmitError(data.error || 'تعذر التحقق من حالة الدفع.');
            setPaymobPolling(false);
            return;
          }

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
        await supabase.functions.invoke('check-paymob-transaction', {
          body: { merchantOrderId: paymobMerchantOrderId, cancel: true, clientSecret: paymobClientSecretRef.current },
        });
      } catch { /* ignore */ }
    }
    clearPendingPaymob();
    setSubmitError('تم إلغاء عملية الدفع. الكتب لا تزال في سلتك.');
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');

    // The payment page opens in a tab of its own. Safari lets a page open one only while it is answering a
    // tap, and the payment is created on the server first, so the tab is opened here, empty, and sent to
    // Paymob when the address comes back. Opened after the wait, it was blocked on an iPhone.
    let payTab: Window | null = null;
    if (isPaymob && selectedMethod) {
      payTab = window.open('about:blank', '_blank');
      try { if (payTab) payTab.opener = null; } catch { /* a tab that won't let go of its opener is still a tab */ }
    }

    const customer = {
      fullName:    form.fullName.trim(),
      email:       form.email.trim(),
      phone:       normalizePhone(form.phone),
      governorate: form.governorate,
      city:        form.city,
      address:     form.address.trim(),
      notes:       form.notes.trim(),
    };

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
            customer,
            country:    selectedCountry,
            shipping,
            items: items.map((i) => ({
              product_id: i.product_id,
              variant_id: i.variant_id,
              quantity:   i.quantity,
              is_digital: i.is_digital,
            })),
            couponCode: appliedCoupon?.code || null,
            turnstileToken: captchaEnabled ? turnstileToken : null,
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
        const clientSecret = data.clientSecret ?? '';
        paymobClientSecretRef.current = clientSecret;
        setPaymobMerchantOrderId(data.merchantOrderId);
        localStorage.setItem('paymob_pending_order_id', data.merchantOrderId);
        localStorage.setItem('paymob_pending_client_secret', clientSecret);
        setPaymobPaymentUrl(data.paymentUrl);
        setPaymobPolling(true);
        setSubmitting(false);
        setPaymobStatusMsg('فتحنا نافذة الدفع في تبويب جديد. أكمل الدفع هناك...');

        if (payTab && !payTab.closed) payTab.location.href = data.paymentUrl;
        else window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
        void pollPaymobTransaction(data.merchantOrderId);
        return;
      }

      // ═══════════════════════════════════════════════════════════════
      //  FORK B — COD (cash on delivery): create the order immediately.
      // ═══════════════════════════════════════════════════════════════
      const order = await createStorefrontOrder({
        customer,
        paymentMethod:   'cod',
        paymentMethodId: selectedPaymentId,
        country:         selectedCountry,
        items,
        shipping,
        paymentType:     'cod',
        couponCode:      appliedCoupon?.code || undefined,
        turnstileToken:  captchaEnabled ? turnstileToken : null,
      });

      finish(order);
    } catch (error) {
      payTab?.close();
      setSubmitError(error instanceof Error ? error.message : 'تعذر إرسال الطلب إلى قاعدة البيانات.');
      turnstileRef.current?.reset();
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpressPay = () => {
    if (Object.keys(expressErrors).length) {
      setShowErrors(true);
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.express-pay [aria-invalid="true"]')?.focus());
      return;
    }
    void handleSubmit();
  };

  // Back to the usual steps with what was typed kept, at the first step still to do.
  const leaveExpress = () => {
    setShowErrors(false);
    setStep(firstIncompleteStep(form, countryCode));
    navigate('/checkout', { replace: true });
  };

  if (submitted) {
    return (
      <div className="page-sections">
        <section className="page-card">
          <div className="empty-state" data-testid="order-confirmed">
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
            {submittedAsGuest ? (
              <p>
                شكرًا على طلبك. سنتواصل معك على رقم <b dir="ltr">{submittedPhone}</b> لتأكيد الطلب وموعد التوصيل.
                احتفظ برقم الطلب لو احتجت تسأل عنه.
              </p>
            ) : (
              <p>شكرًا على طلبك وستتم مراجعته في أقرب وقت.</p>
            )}
            <div className="empty-state__actions">
              {!submittedAsGuest && (
                <Link to="/account/orders" className="primary-button">
                  <PackageCheck size={16} />
                  عرض طلباتي
                </Link>
              )}
              <Link to="/" className={submittedAsGuest ? 'primary-button' : 'ghost-button'}>
                العودة للرئيسية
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const fieldClass = (key: keyof CheckoutForm) => (showErrors && activeErrors[key] ? 'checkout-field checkout-field--error' : 'checkout-field');
  const describedBy = (key: keyof CheckoutForm) => (showErrors && activeErrors[key] ? `err-${key}` : undefined);

  // The delivery fields, the coupon and the security check are used by the three steps and by the one-screen form.
  const contactFields = (
    <>
      <label className={fieldClass('fullName')}>
        <span>الاسم ثلاثيًا *</span>
        <input
          value={form.fullName}
          onChange={(e) => updateField('fullName', e.target.value)}
          placeholder="الاسم الأول واسم الأب واسم العائلة"
          autoComplete="name"
          aria-invalid={Boolean(showErrors && activeErrors.fullName)}
          aria-describedby={describedBy('fullName')}
        />
        <FieldError id="err-fullName" message={showErrors ? activeErrors.fullName : undefined} />
      </label>
      <label className={fieldClass('phone')}>
        <span>رقم الموبايل *</span>
        <input
          type="tel"
          inputMode="tel"
          dir="ltr"
          value={form.phone}
          onChange={(e) => updateField('phone', e.target.value)}
          placeholder="01xxxxxxxxx"
          autoComplete="tel"
          aria-invalid={Boolean(showErrors && activeErrors.phone)}
          aria-describedby={describedBy('phone')}
        />
        <FieldError id="err-phone" message={showErrors ? activeErrors.phone : undefined} />
      </label>
      <label className={fieldClass('email')}>
        <span>البريد الإلكتروني {user ? '' : '(اختياري)'}</span>
        <input
          type="email"
          dir="ltr"
          value={form.email}
          onChange={(e) => updateField('email', e.target.value)}
          placeholder="name@example.com"
          autoComplete="email"
          aria-invalid={Boolean(showErrors && activeErrors.email)}
          aria-describedby={describedBy('email')}
        />
        <small className="checkout-field__hint">لتصلك رسالة تأكيد الطلب وتحديثات حالته.</small>
        <FieldError id="err-email" message={showErrors ? activeErrors.email : undefined} />
      </label>
    </>
  );

  const shippingFields = (
    <>
      <label className={fieldClass('governorate')}>
        <span>المحافظة *</span>
        <select
          value={form.governorate}
          onChange={(e) => updateField('governorate', e.target.value)}
          autoComplete="address-level1"
          aria-invalid={Boolean(showErrors && activeErrors.governorate)}
          aria-describedby={describedBy('governorate')}
        >
          <option value="">اختر المحافظة</option>
          {GOVERNORATES.map((gov) => (
            <option key={gov} value={gov}>{gov}</option>
          ))}
        </select>
        <FieldError id="err-governorate" message={showErrors ? activeErrors.governorate : undefined} />
      </label>
      <label className={fieldClass('city')}>
        <span>المدينة *</span>
        <select
          value={form.city}
          onChange={(e) => updateField('city', e.target.value)}
          autoComplete="address-level2"
          disabled={!form.governorate}
          aria-invalid={Boolean(showErrors && activeErrors.city)}
          aria-describedby={describedBy('city')}
        >
          <option value="">{form.governorate ? 'اختر المدينة' : 'اختر المحافظة أولًا'}</option>
          {availableCities.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
        <FieldError id="err-city" message={showErrors ? activeErrors.city : undefined} />
      </label>
      <label className={fieldClass('address')}>
        <span>العنوان بالتفصيل *</span>
        <input
          value={form.address}
          onChange={(e) => updateField('address', e.target.value)}
          placeholder="الشارع، رقم المبنى، الدور، علامة مميزة"
          autoComplete="street-address"
          aria-invalid={Boolean(showErrors && activeErrors.address)}
          aria-describedby={describedBy('address')}
        />
        <FieldError id="err-address" message={showErrors ? activeErrors.address : undefined} />
      </label>
      <label className="checkout-field">
        <span>ملاحظات (اختياري)</span>
        <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="أي تفاصيل تساعد المندوب" />
      </label>
    </>
  );

  const couponCard = (
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
  );

  const securityCard = captchaEnabled ? (
    <div className="contact-card">
      <h3>التحقق الأمني</h3>
      <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />
    </div>
  ) : null;


  return (
    <div className="page-sections">
      <section className="page-card">
        <div className="page-card__head">
          <div>
            <span className="page-kicker">إتمام الطلب</span>
            <h1>{expressEligible ? 'الدفع السريع عبر Apple Pay' : 'إتمام الطلب في 3 خطوات'}</h1>
            <p>
              {expressEligible
                ? 'بيانات التوصيل في شاشة واحدة، وبعدها تدفع مباشرةً عبر Apple Pay.'
                : (user ? 'راجع بياناتك وعنوانك، ثم اختر طريقة الدفع.' : 'بدون إنشاء حساب: بياناتك، ثم العنوان، ثم الدفع.')}
            </p>
          </div>
        </div>
        <OrnamentDivider />

        {items.length === 0 ? (
          <div className="empty-state">
            <CreditCard size={24} />
            <h3>لا يوجد شيء لإتمامه</h3>
            <p>السلة فارغة حاليًا. أضف كتبًا أولًا ثم ارجع إلى صفحة الدفع.</p>
            <Link to="/books" className="primary-button">الذهاب إلى الكتب</Link>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="contact-form checkout-steps-wrap">
              {expressLoading ? (
                <div className="contact-card checkout-step" data-testid="express-pay-loading">
                  <p className="checkout-step__hint">جاري تجهيز الدفع السريع...</p>
                </div>
              ) : expressEligible ? (
                <>
                  {/* ── One screen: the delivery details, then Apple Pay ──────────────── */}
                  <div className="contact-card checkout-step express-pay" data-testid="express-pay">
                    <h3><Zap size={17} /> بيانات التوصيل</h3>
                    <p className="checkout-step__hint">
                      اكتب بياناتك، أو املأها بلمسة من Safari (من بطاقة جهات الاتصال)، ثم ادفع عبر Apple Pay.
                      {!user && <> عندك حساب؟ <Link to="/account?next=/checkout">سجّل الدخول</Link>.</>}
                    </p>
                    <div className="express-pay__grid">
                      {contactFields}
                      {shippingFields}
                    </div>
                  </div>
                  {couponCard}
                  {securityCard}
                  <div className="checkout-step__nav">
                    <button type="button" className="ghost-button" onClick={leaveExpress}>الدفع بطريقة أخرى</button>
                  </div>
                </>
              ) : (
              <>
              {/* ── The three steps ─────────────────────────────── */}
              <ol className="checkout-stepper" aria-label="خطوات إتمام الطلب">
                {STEPS.map(({ step: n, label }) => {
                  const done = n < step;
                  return (
                    <li key={n} className={`checkout-stepper__item${n === step ? ' is-current' : ''}${done ? ' is-done' : ''}`}>
                      <button
                        type="button"
                        onClick={() => goTo(n)}
                        aria-current={n === step ? 'step' : undefined}
                        disabled={n === step}
                      >
                        <span className="checkout-stepper__num" aria-hidden="true">{done ? <Check size={14} /> : n}</span>
                        <span className="checkout-stepper__label">{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {digitalNeedsAccount && (
                <div className="auth-alert auth-alert--warning checkout-digital-note" role="status">
                  <p>سلتك فيها كتاب رقمي، والكتب الرقمية تحتاج تسجيل الدخول لأنها تُحمَّل من حسابك بعد الشراء. سجّل الدخول، أو احذف الكتاب الرقمي من السلة لتكمل بدون حساب.</p>
                  <div className="checkout-digital-note__actions">
                    <Link to="/account?next=/checkout" className="primary-button"><LogIn size={15} /> تسجيل الدخول</Link>
                    <Link to="/cart" className="ghost-button">تعديل السلة</Link>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="contact-card checkout-step" data-testid="checkout-step-1">
                  <h3 ref={stepHeading} tabIndex={-1}><UserRound size={17} /> بياناتك</h3>
                  {!user && (
                    <p className="checkout-step__hint">
                      عندك حساب؟ <Link to="/account?next=/checkout">سجّل الدخول</Link> لتتابع طلباتك من حسابك. أو أكمل بدون حساب.
                    </p>
                  )}
                  {contactFields}
                  <div className="checkout-step__nav">
                    <button type="button" className="primary-button" onClick={next} disabled={digitalNeedsAccount}>
                      التالي: الشحن والعنوان
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="contact-card checkout-step" data-testid="checkout-step-2">
                  <h3 ref={stepHeading} tabIndex={-1}><Truck size={17} /> الشحن والعنوان</h3>
                  {shippingFields}
                  <div className="checkout-step__nav">
                    <button type="button" className="ghost-button" onClick={() => goTo(1)}>رجوع</button>
                    <button type="button" className="primary-button" onClick={next}>التالي: الدفع</button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <>
                  <div className="contact-card checkout-step" data-testid="checkout-step-3">
                    <h3 ref={stepHeading} tabIndex={-1}><CreditCard size={17} /> طريقة الدفع</h3>

                    <div className="checkout-recap">
                      <p><UserRound size={14} /> {form.fullName} · <Phone size={13} /> <span dir="ltr">{normalizePhone(form.phone)}</span></p>
                      <p><Truck size={14} /> {form.governorate}، {form.city}، {form.address}</p>
                      <button type="button" className="checkout-recap__edit" onClick={() => goTo(1)}>تعديل البيانات</button>
                    </div>

                    {hasDigitalItem ? (
                      <p className="checkout-step__hint">
                        سلتك تحتوي على كتاب رقمي — الدفع الإلكتروني إلزامي (لا يتوفر الدفع عند الاستلام).
                      </p>
                    ) : null}

                    {paymentMethods.length === 0 ? (
                      <p className="checkout-step__hint">جاري تحميل طرق الدفع...</p>
                    ) : availablePaymentMethods.length === 0 ? (
                      <p className="checkout-field__error">لا تتوفر حاليًا طريقة دفع إلكتروني للكتب الرقمية. تواصل مع الدعم.</p>
                    ) : (
                      <div className="variant-selector__grid" role="radiogroup" aria-label="طريقة الدفع">
                        {availablePaymentMethods.map((method) => (
                          <button
                            key={method.id}
                            type="button"
                            role="radio"
                            aria-checked={selectedPaymentId === method.id}
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

                  {couponCard}

                  {securityCard}

                  <div className="checkout-step__nav">
                    <button type="button" className="ghost-button" onClick={() => goTo(2)}>رجوع</button>
                  </div>
                </>
              )}
              </>
              )}
            </div>

            {/* ── ملخص الطلب ────────────────────────────────────── */}
            <aside className="order-summary">
              <h3>ملخص الطلب</h3>

              {items.map((item) => (
                <div key={item.key}>
                  <span>
                    {item.title} - {item.variant_name} × {item.quantity}
                    {!item.is_digital && item.weight_kg != null && (
                      <small className="order-summary__item-weight">
                        {' '}({(item.weight_kg * item.quantity).toFixed(2)} كجم)
                      </small>
                    )}
                  </span>
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

              {cartWeightKg > 0 && (
                <div>
                  <span>الوزن الإجمالي</span>
                  <b>{cartWeightKg.toFixed(2)} كجم</b>
                </div>
              )}

              <div>
                <span>الشحن{!form.governorate && shipping > 0 ? ' (تقديري)' : ''}</span>
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

              {unavailableRemoved.length > 0 ? (
                <div className="auth-alert auth-alert--warning" style={{ fontSize: '0.85rem' }}>
                  لم تعد هذه المنتجات متاحة وتمت إزالتها من سلتك: {unavailableRemoved.join('، ')}
                </div>
              ) : null}

              {submitError ? (
                <div className="auth-alert auth-alert--error" role="alert">{submitError}</div>
              ) : null}

              {expressEligible ? (
                <>
                  {captchaEnabled && !turnstileToken ? (
                    <div className="auth-alert auth-alert--warning" style={{ fontSize: '0.85rem' }}>
                      انتظر حتى يكتمل التحقق الأمني.
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="apple-pay-button"
                    lang="ar"
                    aria-label="الدفع عبر Apple Pay"
                    data-testid="apple-pay-button"
                    onClick={handleExpressPay}
                    disabled={submitting || (captchaEnabled && !turnstileToken)}
                  />
                  <p className="checkout-summary__note">
                    {submitting ? 'جاري التحويل لصفحة الدفع الآمنة...' : 'ستنتقل لصفحة الدفع الآمنة وتؤكّد الدفع بالوجه أو البصمة.'}
                  </p>
                </>
              ) : step === 3 ? (
                <>
                  {captchaEnabled && !turnstileToken ? (
                    <div className="auth-alert auth-alert--warning" style={{ fontSize: '0.85rem' }}>
                      انتظر حتى يكتمل التحقق الأمني.
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
                </>
              ) : (
                <p className="checkout-summary__note">الخطوة {step} من 3. زر تأكيد الطلب في خطوة الدفع.</p>
              )}

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
