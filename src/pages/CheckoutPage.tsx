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

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          language?: string;
          theme?: 'light' | 'dark' | 'auto';
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove?: (widgetId: string) => void;
    };
  }
}

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

// التحقق من الاسم الثلاثي
function isTripleName(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).length >= 3;
}

type CheckoutForm = {
  fullName: string;
  email: string;
  phone: string;
  governorate: string;
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

  // الكتب الرقمية تتطلب دفعًا إلكترونيًا مؤكدًا فقط — الدفع عند الاستلام لا معنى
  // له لملف لا يُسلَّم فعليًا، وقد يمنح وصولاً مجانيًا لو أكّد الأدمن الطلب لاحقًا
  // كإجراء روتيني (نفس القاعدة المطبّقة في التطبيق).
  const hasDigitalItem = items.some((i) => i.is_digital);
  const availablePaymentMethods = useMemo(
    () =>
      hasDigitalItem
        ? paymentMethods.filter((m) => m.provider.toLowerCase().startsWith('paymob'))
        : paymentMethods,
    [paymentMethods, hasDigitalItem]
  );

  useEffect(() => {
    // أعد الاختيار لو مفيش طريقة مختارة، أو لو المختارة لم تعد متاحة (مثلاً كانت
    // COD وتغيّرت السلة لتضم كتابًا رقميًا).
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Paymob polling state ──────────────────────────────────────────
  const [paymobPolling, setPaymobPolling] = useState(false);
  const [paymobMerchantOrderId, setPaymobMerchantOrderId] = useState<string | null>(null);
  const [paymobPaymentUrl, setPaymobPaymentUrl] = useState<string | null>(null);
  const [paymobStatusMsg, setPaymobStatusMsg] = useState<string>('جارٍ إنتظار تأكيد الدفع...');
  const pollAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const paymobClientSecretRef = useRef<string>('');

  const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim();
  const captchaEnabled = Boolean(turnstileSiteKey);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (!user?.email) return;
    setForm((prev) => (prev.email ? prev : { ...prev, email: user.email ?? '' }));
  }, [user?.email]);

  const canSubmit = useMemo(() => {
    return Boolean(
      items.length > 0 &&
      selectedPaymentId &&
      (!hasDigitalItem || isPaymob) &&
      isTripleName(form.fullName) &&
      form.email.trim() &&
      form.phone.trim() &&
      form.governorate.trim() &&
      form.city.trim() &&
      form.address.trim() &&
      (!captchaEnabled || turnstileToken)
    );
  }, [captchaEnabled, items.length, selectedPaymentId, hasDigitalItem, isPaymob, form, turnstileToken]);

  // Diagnostic: list the missing fields so the user knows exactly what's wrong
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (items.length === 0) missing.push('السلة فارغة');
    if (!selectedPaymentId) missing.push('طريقة الدفع');
    if (hasDigitalItem && !isPaymob) missing.push('الكتب الرقمية تتطلب الدفع الإلكتروني (لا يوجد دفع عند الاستلام)');
    if (!form.fullName.trim()) missing.push('الاسم الكامل');
    if (!form.email.trim()) missing.push('البريد الإلكتروني');
    if (!form.phone.trim()) missing.push('رقم الهاتف');
    if (!form.governorate.trim()) missing.push('المحافظة');
    if (!form.city.trim()) missing.push('المدينة');
    if (!form.address.trim()) missing.push('العنوان');
    if (captchaEnabled && !turnstileToken) missing.push('التحقق الأمني');
    return missing;
  }, [captchaEnabled, items.length, selectedPaymentId, hasDigitalItem, isPaymob, form, turnstileToken]);

  const updateField = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      // إعادة تعيين المدينة عند تغيير المحافظة
      ...(key === 'governorate' ? { city: '' } : {}),
    }));
  };

  // مدن المحافظة المختارة
  const availableCities = EGYPT_REGIONS[form.governorate] ?? [];

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

  useEffect(() => {
    if (!captchaEnabled || !turnstileSiteKey || !turnstileContainerRef.current) return undefined;

    let cancelled = false;
    const renderTurnstile = () => {
      if (
        cancelled ||
        !window.turnstile ||
        !turnstileContainerRef.current ||
        turnstileWidgetRef.current
      ) {
        return;
      }

      turnstileWidgetRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey,
        language: 'ar',
        theme: 'auto',
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    };

    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    if (window.turnstile) {
      renderTurnstile();
    } else {
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstileScript = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', renderTurnstile);
    }

    return () => {
      cancelled = true;
      script?.removeEventListener('load', renderTurnstile);
      if (turnstileWidgetRef.current && window.turnstile?.remove) {
        window.turnstile.remove(turnstileWidgetRef.current);
      }
      turnstileWidgetRef.current = null;
      setTurnstileToken('');
    };
  }, [captchaEnabled, turnstileSiteKey]);

  const resetTurnstile = () => {
    if (!captchaEnabled || !turnstileWidgetRef.current || !window.turnstile) return;
    window.turnstile.reset(turnstileWidgetRef.current);
    setTurnstileToken('');
  };

  // Clear coupon when cart/country changes
  useEffect(() => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  }, [subtotal, items.length, selectedCountry?.id]);

  const clearPendingPaymob = () => {
    localStorage.removeItem('paymob_pending_order_id');
    localStorage.removeItem('paymob_pending_client_secret');
    paymobClientSecretRef.current = '';
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
            clearPendingPaymob();
            clearCart();
            void queryClient.invalidateQueries({ queryKey: ['product-variants-public'] });
            void queryClient.invalidateQueries({ queryKey: ['products-public-catalog'] });
            return;
          }

          if (data.status === 'failed') {
            // Payment failed — release stock, keep cart, show error
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
        // Explicitly cancel pending payment to release reserved stock
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
        turnstileToken:  captchaEnabled ? turnstileToken : null,
      });

      // الكوبون يُطبّق داخل create-storefront-order (سيرفر)
      // لا حاجة لاستدعاء apply_coupon_to_order مرة أخرى هنا

      setSubmittedOrder(order);
      setSubmitted(true);
      clearCart();

      void queryClient.invalidateQueries({ queryKey: ['product-variants-public'] });
      void queryClient.invalidateQueries({ queryKey: ['products-public-catalog'] });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'تعذر إرسال الطلب إلى قاعدة البيانات.');
      resetTurnstile();
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
            <p>شكرًا على طلبك وستتم مراجعته في أقرب وقت.</p>
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

                <div>
                  <input
                    value={form.fullName}
                    onChange={(e) => updateField('fullName', e.target.value)}
                    placeholder="الاسم الثلاثي كاملاً *"
                    autoComplete="name"
                  />
                  {form.fullName.trim() && !isTripleName(form.fullName) && (
                    <small style={{ color: 'var(--error, #e53e3e)', fontSize: '0.78rem', marginTop: '4px', display: 'block' }}>
                      يرجى إدخال الاسم ثلاثياً (الاسم الأول والأب والعائلة)
                    </small>
                  )}
                </div>
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

                <select
                  value={form.governorate}
                  onChange={(e) => updateField('governorate', e.target.value)}
                >
                  <option value="">-- اختر المحافظة * --</option>
                  {GOVERNORATES.map((gov) => (
                    <option key={gov} value={gov}>{gov}</option>
                  ))}
                </select>

                <select
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  disabled={!form.governorate}
                >
                  <option value="">
                    {form.governorate ? '-- اختر المدينة * --' : '-- اختر المحافظة أولاً --'}
                  </option>
                  {availableCities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
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

                {hasDigitalItem ? (
                  <p style={{ fontSize: '0.85rem', opacity: 0.75, marginBottom: 8 }}>
                    سلتك تحتوي على كتاب رقمي — الدفع الإلكتروني إلزامي (لا يتوفر الدفع عند الاستلام).
                  </p>
                ) : null}

                {paymentMethods.length === 0 ? (
                  <p style={{ opacity: 0.5, fontSize: '0.9rem' }}>جاري تحميل طرق الدفع...</p>
                ) : availablePaymentMethods.length === 0 ? (
                  <p style={{ color: 'var(--error, #e53e3e)', fontSize: '0.85rem' }}>
                    لا تتوفر حاليًا طريقة دفع إلكتروني للكتب الرقمية. تواصل مع الدعم.
                  </p>
                ) : (
                  <div className="variant-selector__grid">
                    {availablePaymentMethods.map((method) => (
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

              {captchaEnabled ? (
                <div className="contact-card">
                  <h3>التحقق الأمني</h3>
                  <div ref={turnstileContainerRef} />
                </div>
              ) : null}

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
