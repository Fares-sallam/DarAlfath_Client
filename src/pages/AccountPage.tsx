import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronLeft, CheckCircle2, Download, Heart, LogOut, PackageCheck, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type AuthMode = 'login' | 'signup' | 'verify' | 'forgot' | 'reset';

const initialForm = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  verificationCode: '',
};

function getInitialAuthMode(): AuthMode {
  if (typeof window === 'undefined') return 'login';

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const isRecovery =
    searchParams.get('mode') === 'reset' ||
    searchParams.get('type') === 'recovery' ||
    hashParams.get('type') === 'recovery';

  return isRecovery ? 'reset' : 'login';
}

export default function AccountPage() {
  const {
    user,
    loading,
    authEvent,
    signIn,
    signUp,
    verifyEmailCode,
    resendConfirmation,
    resetPassword,
    updatePassword,
    signOut,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>(() => getInitialAuthMode());
  const [form, setForm] = useState(initialForm);
  const [pendingSignupPassword, setPendingSignupPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const displayName = useMemo(() => {
    const metadataName = user?.user_metadata?.full_name;
    if (typeof metadataName === 'string' && metadataName.trim()) return metadataName;
    return user?.email?.split('@')[0] || 'قارئ دار الفتح';
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === '1') {
      setNotice('تم تأكيد البريد بنجاح. يمكنك تسجيل الدخول الآن.');
      window.history.replaceState({}, '', '/account');
    }
  }, []);

  // Switch to reset mode when Supabase fires PASSWORD_RECOVERY (e.g. user clicked reset link)
  useEffect(() => {
    if (authEvent === 'PASSWORD_RECOVERY') {
      setMode('reset');
      setNotice('');
      setError('');
    }
  }, [authEvent]);

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
    setNotice('');
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setNotice('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'verify') {
      if (!form.email.trim()) {
        setError('اكتب البريد الإلكتروني المرتبط بالحساب.');
        return;
      }

      if (form.verificationCode.replace(/\D/g, '').length !== 6) {
        setError('اكتب كود التحقق المكوّن من 6 أرقام.');
        return;
      }

      setSubmitting(true);
      const result = await verifyEmailCode(form.email, form.verificationCode);

      if (result.error) {
        setSubmitting(false);
        setError(result.error);
        return;
      }

      if (pendingSignupPassword) {
        const passwordResult = await updatePassword(pendingSignupPassword);
        setSubmitting(false);

        if (passwordResult.error) {
          setError(passwordResult.error);
          return;
        }

        setPendingSignupPassword('');
        setNotice('تم تأكيد البريد وإنشاء كلمة المرور. يمكنك استخدام حسابك الآن.');
      } else {
        setSubmitting(false);
        setNotice(result.message || 'تم تأكيد البريد.');
      }

      setForm(initialForm);
      setMode('login');
      return;
    }

    if (mode === 'forgot') {
      if (!form.email.trim()) {
        setError('أدخل البريد الإلكتروني لإرسال رابط إعادة التعيين.');
        return;
      }

      setSubmitting(true);
      const result = await resetPassword(form.email);
      setSubmitting(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setNotice(result.message || 'تم إرسال رابط إعادة التعيين.');
      return;
    }

    if (mode === 'reset') {
      if (!form.password || form.password.length < 6) {
        setError('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.');
        return;
      }

      if (form.password !== form.confirmPassword) {
        setError('تأكيد كلمة المرور غير مطابق.');
        return;
      }

      setSubmitting(true);
      const result = await updatePassword(form.password);
      setSubmitting(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setNotice(result.message || 'تم تحديث كلمة المرور.');
      setForm(initialForm);
      setMode('login');
      return;
    }

    if (!form.email.trim() || !form.password) {
      setError('أدخل البريد الإلكتروني وكلمة المرور.');
      return;
    }

    if (mode === 'signup') {
      if (!form.fullName.trim()) {
        setError('أدخل الاسم الكامل لإنشاء الحساب.');
        return;
      }

      if (form.password.length < 6) {
        setError('كلمة المرور يجب ألا تقل عن 6 أحرف.');
        return;
      }

      if (form.password !== form.confirmPassword) {
        setError('تأكيد كلمة المرور غير مطابق.');
        return;
      }
    }

    setSubmitting(true);
    const result = mode === 'login'
      ? await signIn(form.email, form.password)
      : await signUp({
        email: form.email,
        password: form.password,
        fullName: form.fullName,
      });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice(result.message || 'تمت العملية بنجاح.');
    if (mode === 'signup') {
      setPendingSignupPassword(form.password);
      setMode('verify');
      setForm((prev) => ({
        ...initialForm,
        email: prev.email,
      }));
      return;
    }
    setForm(initialForm);
  };

  const handleSignOut = async () => {
    setSubmitting(true);
    const result = await signOut();
    setSubmitting(false);
    if (result.error) setError(result.error);
  };

  const handleResendConfirmation = async () => {
    setError('');
    setNotice('');

    if (!form.email.trim()) {
      setError('اكتب البريد الإلكتروني أولًا ثم اضغط إعادة إرسال رسالة التحقق.');
      return;
    }

    setSubmitting(true);
    const result = await resendConfirmation(form.email);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice(result.message || 'تم إرسال رسالة التحقق مرة أخرى.');
  };

  if (loading) {
    return (
      <div className="page-sections">
        <section className="page-card page-card--loading" />
      </div>
    );
  }

  if (user && mode !== 'reset') {
    const initials = displayName
      .split(' ')
      .map((w: string) => w[0])
      .slice(0, 2)
      .join('');

    return (
      <div className="page-sections">

        {/* ── Profile Banner ─────────────────────────────── */}
        <section className="profile-banner">
          <div className="profile-banner__glow" aria-hidden="true" />

          <div className="profile-banner__identity">
            <div className="profile-banner__avatar" aria-hidden="true">
              {initials || <UserRound size={30} />}
            </div>
            <div className="profile-banner__meta">
              <span className="profile-banner__kicker">حساب العميل</span>
              <h1 className="profile-banner__name">أهلًا، {displayName}</h1>
              <p className="profile-banner__email">{user.email}</p>
            </div>
          </div>

          <div className="profile-banner__actions">
            <span className="profile-banner__badge">
              <CheckCircle2 size={14} />
              حساب مفعّل
            </span>
            <button
              type="button"
              className="profile-banner__logout"
              onClick={handleSignOut}
              disabled={submitting}
            >
              <LogOut size={15} />
              {submitting ? 'جارٍ الخروج...' : 'تسجيل الخروج'}
            </button>
          </div>
        </section>

        {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}

        {/* ── Quick Navigation ────────────────────────────── */}
        <div className="profile-nav">
          <Link to="/account/orders" className="profile-nav__item">
            <div className="profile-nav__icon profile-nav__icon--orders">
              <PackageCheck size={22} />
            </div>
            <div className="profile-nav__text">
              <h3>طلباتي</h3>
              <p>تابع حالة طلباتك الحالية والسابقة</p>
            </div>
            <ChevronLeft size={17} className="profile-nav__arrow" />
          </Link>

          <Link to="/wishlist" className="profile-nav__item">
            <div className="profile-nav__icon profile-nav__icon--wish">
              <Heart size={22} />
            </div>
            <div className="profile-nav__text">
              <h3>المفضلة</h3>
              <p>الكتب المحفوظة للرجوع إليها لاحقًا</p>
            </div>
            <ChevronLeft size={17} className="profile-nav__arrow" />
          </Link>

          <Link to="/account/downloads" className="profile-nav__item">
            <div className="profile-nav__icon profile-nav__icon--dl">
              <Download size={22} />
            </div>
            <div className="profile-nav__text">
              <h3>التنزيلات</h3>
              <p>الوصول إلى الكتب الرقمية المشتراة</p>
            </div>
            <ChevronLeft size={17} className="profile-nav__arrow" />
          </Link>

          <Link to="/books" className="profile-nav__item">
            <div className="profile-nav__icon profile-nav__icon--browse">
              <BookOpen size={22} />
            </div>
            <div className="profile-nav__text">
              <h3>تصفّح الكتب</h3>
              <p>اكتشف إصداراتنا الجديدة والمميزة</p>
            </div>
            <ChevronLeft size={17} className="profile-nav__arrow" />
          </Link>
        </div>

        {/* ── Account Details ─────────────────────────────── */}
        <section className="profile-details">
          <div className="profile-details__header">
            <ShieldCheck size={18} />
            <h2>معلومات الحساب</h2>
          </div>

          <div className="profile-details__body">
            <div className="profile-details__row">
              <span>الاسم الكامل</span>
              <b>{displayName}</b>
            </div>
            <div className="profile-details__row">
              <span>البريد الإلكتروني</span>
              <b dir="ltr">{user.email}</b>
            </div>
            <div className="profile-details__row">
              <span>حالة الحساب</span>
              <span className="profile-details__verified">
                <CheckCircle2 size={14} />
                مفعّل ومتصل
              </span>
            </div>
            <div className="profile-details__row">
              <span>مزوّد الهوية</span>
              <b>Supabase Auth</b>
            </div>
          </div>
        </section>

      </div>
    );
  }

  return (
    <div className="page-sections">
      <section className="auth-layout">
        <div className="auth-copy">
          <span className="page-kicker">حساب العميل</span>
          <h1>
            {mode === 'forgot'
              ? 'استرجاع كلمة المرور'
              : mode === 'reset'
                ? 'اكتب كلمة مرور جديدة'
                : mode === 'verify'
                  ? 'تحقق من بريدك'
                : 'ادخل لحسابك أو أنشئ حسابًا جديدًا'}
          </h1>
          <p>
            التسجيل والاسترجاع يستخدمان كود تحقق مباشر من Supabase Auth، ثم
            نحفظ كلمة المرور بعد تأكيد البريد.
          </p>

          <div className="auth-benefits">
            <div>
              <ShieldCheck size={17} />
              حساب آمن عبر Supabase
            </div>
            <div>
              <PackageCheck size={17} />
              متابعة الطلبات
            </div>
            <div>
              <Download size={17} />
              تنزيلات الكتب الرقمية
            </div>
          </div>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          {mode === 'login' || mode === 'signup' ? (
            <div className="auth-tabs">
              <button
                type="button"
                className={mode === 'login' ? 'active' : ''}
                onClick={() => switchMode('login')}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                className={mode === 'signup' ? 'active' : ''}
                onClick={() => switchMode('signup')}
              >
                إنشاء حساب
              </button>
            </div>
          ) : (
            <div className="auth-mode-title">
              <b>
                {mode === 'forgot'
                  ? 'نسيت كلمة المرور'
                  : mode === 'verify'
                    ? 'كود التحقق'
                    : 'تعيين كلمة مرور جديدة'}
              </b>
              <button type="button" onClick={() => switchMode('login')}>
                العودة لتسجيل الدخول
              </button>
            </div>
          )}

          {mode === 'signup' ? (
            <label>
              الاسم الكامل
              <input
                value={form.fullName}
                onChange={(event) => updateField('fullName', event.target.value)}
                placeholder="مثال: أحمد محمد"
                autoComplete="name"
              />
            </label>
          ) : null}

          {mode !== 'reset' ? (
            <label>
              البريد الإلكتروني
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
              />
            </label>
          ) : null}

          {mode === 'verify' ? (
            <label>
              كود التحقق
              <input
                value={form.verificationCode}
                onChange={(event) => updateField('verificationCode', event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="auth-code-input"
              />
            </label>
          ) : null}

          {mode !== 'forgot' && mode !== 'verify' ? (
            <label>
              {mode === 'reset' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
          ) : null}

          {mode === 'signup' || mode === 'reset' ? (
            <label>
              تأكيد كلمة المرور
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => updateField('confirmPassword', event.target.value)}
                placeholder="أعد كتابة كلمة المرور"
                autoComplete="new-password"
              />
            </label>
          ) : null}

          {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
          {notice ? <div className="auth-alert auth-alert--success">{notice}</div> : null}

          <button type="submit" className="primary-button primary-button--full" disabled={submitting}>
            {submitting
              ? 'جاري التنفيذ...'
              : mode === 'login'
                ? 'تسجيل الدخول'
                : mode === 'signup'
                  ? 'إنشاء الحساب وإرسال التأكيد'
                  : mode === 'verify'
                    ? 'تأكيد الكود'
                  : mode === 'forgot'
                    ? 'إرسال رابط إعادة التعيين'
                    : 'حفظ كلمة المرور الجديدة'}
          </button>

          {mode === 'verify' ? (
            <p className="auth-footnote">
              لم يصلك الكود؟{' '}
              <button type="button" onClick={handleResendConfirmation} disabled={submitting}>
                إعادة إرسال التحقق
              </button>
            </p>
          ) : null}

          {mode === 'login' || mode === 'signup' ? (
            <p className="auth-footnote">
              {mode === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}{' '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              >
                {mode === 'login' ? 'أنشئ حسابًا' : 'سجّل الدخول'}
              </button>
              {mode === 'login' ? (
                <>
                  <span> | </span>
                  <button type="button" onClick={() => switchMode('forgot')}>
                    نسيت كلمة المرور؟
                  </button>
                </>
              ) : null}
              {mode === 'signup' ? (
                <>
                  <span> | </span>
                  <button type="button" onClick={handleResendConfirmation} disabled={submitting}>
                    إعادة إرسال التحقق
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
