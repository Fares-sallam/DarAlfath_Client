import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, ChevronLeft, CheckCircle2, Download, Heart, LogOut, PackageCheck,
  ShieldCheck, UserRound, AlertTriangle, Loader2, X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import OtpInput from '@/components/OtpInput';

/** Typed exactly (not just "any text") before the delete button enables —
 *  the standard "type to confirm" pattern for an action this irreversible. */
const DELETE_CONFIRM_WORD = 'حذف';

type AuthMode = 'login' | 'signup' | 'verify' | 'forgot' | 'forgot-verify' | 'reset';

const initialForm = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  verificationCode: '',
};

/** Seconds to wait before allowing another OTP resend */
const RESEND_COOLDOWN = 60;

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
    sendResetOtp,
    verifyResetOtp,
    updatePassword,
    signOut,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>(() => getInitialAuthMode());
  const [form, setForm] = useState(initialForm);
  const [pendingSignupPassword, setPendingSignupPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();

  // ── Account deletion ────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // ── Resend cooldown timer ──────────────────────────
  const startCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

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
    // Clear sensitive data when switching away from signup/verify flow
    if (nextMode !== 'verify') setPendingSignupPassword('');
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
        setError('أدخل البريد الإلكتروني لإرسال كود التحقق.');
        return;
      }

      setSubmitting(true);
      const result = await sendResetOtp(form.email);
      setSubmitting(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      // BUG FIX: Don't use switchMode — it clears the notice.
      // Set mode directly and only clear the error.
      setError('');
      setNotice(result.message || 'تم إرسال كود التحقق.');
      setMode('forgot-verify');
      setForm((prev) => ({ ...initialForm, email: prev.email }));
      startCooldown();
      return;
    }

    if (mode === 'forgot-verify') {
      if (!form.email.trim()) {
        setError('أدخل البريد الإلكتروني المرتبط بحسابك.');
        return;
      }

      if (form.verificationCode.replace(/\D/g, '').length !== 6) {
        setError('أدخل كود التحقق المكوّن من 6 أرقام.');
        return;
      }

      // Set mode to 'reset' BEFORE the async call to prevent profile page
      // flash caused by verifyOtp signing the user in via onAuthStateChange.
      setMode('reset');

      setSubmitting(true);
      const result = await verifyResetOtp(form.email, form.verificationCode);
      setSubmitting(false);

      if (result.error) {
        // Verification failed — go back to forgot-verify mode
        setMode('forgot-verify');
        setError(result.error);
        return;
      }

      setError('');
      setNotice(result.message || 'تم التحقق بنجاح.');
      setForm((prev) => ({ ...initialForm, email: prev.email }));
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
      // If auto-confirmed (mailer_autoconfirm enabled), the user is already
      // signed in — go straight to profile instead of the OTP verify screen.
      if (result.autoConfirmed) {
        setForm(initialForm);
        return;
      }

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

  const closeDeleteModal = () => {
    if (deletingAccount) return; // don't let a stray click cancel mid-request
    setShowDeleteModal(false);
    setDeleteConfirmText('');
    setDeleteError('');
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== DELETE_CONFIRM_WORD) return;

    setDeletingAccount(true);
    setDeleteError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('delete-account', {
        body: {},
      });

      if (fnError || data?.error) {
        setDeleteError(data?.error || 'تعذر حذف الحساب. حاول مرة أخرى أو تواصل معنا.');
        setDeletingAccount(false);
        return;
      }

      // The account is gone server-side — drop the local session too, then
      // leave the page entirely rather than re-render a now-meaningless
      // "logged in" view. The server-side call inside signOut() naturally
      // 403s (there's no user left to invalidate a session for); that's
      // expected here, not a real failure, so it's never surfaced.
      await supabase.auth.signOut().catch(() => {});
      navigate('/', { replace: true, state: { accountDeleted: true } });
    } catch {
      setDeleteError('تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.');
      setDeletingAccount(false);
    }
  };

  const handleResendConfirmation = async () => {
    setError('');
    setNotice('');

    if (!form.email.trim()) {
      setError('اكتب البريد الإلكتروني أولًا ثم اضغط إعادة إرسال رسالة التحقق.');
      return;
    }

    if (resendCooldown > 0) return;

    setSubmitting(true);
    const result = await resendConfirmation(form.email);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice(result.message || 'تم إرسال رسالة التحقق مرة أخرى.');
    startCooldown();
  };

  const handleResendResetOtp = async () => {
    setError('');
    setNotice('');

    if (!form.email.trim()) {
      setError('أدخل البريد الإلكتروني أولاً.');
      return;
    }

    if (resendCooldown > 0) return;

    setSubmitting(true);
    const result = await sendResetOtp(form.email);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice(result.message || 'تم إرسال كود تحقق جديد.');
    startCooldown();
  };

  if (loading) {
    return (
      <div className="page-sections">
        <section className="page-card page-card--loading" />
      </div>
    );
  }

  // Exclude forgot-verify to prevent profile flash during OTP verification
  // (verifyOtp signs the user in, but we still need to show the reset form)
  if (user && mode !== 'reset' && mode !== 'forgot-verify') {
    const initials = displayName
      .split(' ')
      .map((w: string) => w[0])
      .slice(0, 2)
      .join('');

    return (
      <>
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
        {notice ? <div className="auth-alert auth-alert--success">{notice}</div> : null}

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

        {/* ── Danger zone ──────────────────────────────────
               Required by Apple (§5.1.1(v)) and Google Play: account
               creation must be matched by in-app, self-service deletion —
               not an email-to-support flow. ── */}
        <section className="danger-zone">
          <div className="danger-zone__header">
            <AlertTriangle size={18} />
            <h2>حذف الحساب</h2>
          </div>
          <p className="danger-zone__copy">
            حذف حسابك نهائي ولا يمكن التراجع عنه. سيُحذف اسمك وبريدك الإلكتروني وبيانات
            حسابك فورًا، وتفقد الوصول لكتبك الرقمية داخل التطبيق. تبقى طلباتك السابقة
            كسجلّ محاسبي دون أي بيانات تعرّف عليك، كما هو موضّح في{' '}
            <Link to="/policies#privacy">سياسة الخصوصية</Link>.
          </p>
          <button
            type="button"
            className="danger-zone__trigger"
            onClick={() => setShowDeleteModal(true)}
          >
            حذف الحساب نهائيًا
          </button>
        </section>

      </div>

      {showDeleteModal ? (
        <div className="delete-modal" role="dialog" aria-modal="true" aria-label="تأكيد حذف الحساب">
          <div className="delete-modal__backdrop" onClick={closeDeleteModal} />
          <div className="delete-modal__panel">
            <button
              type="button"
              className="delete-modal__close"
              onClick={closeDeleteModal}
              aria-label="إغلاق"
              disabled={deletingAccount}
            >
              <X size={18} />
            </button>

            <AlertTriangle size={28} className="delete-modal__icon" />
            <h3>تأكيد حذف الحساب</h3>
            <p>
              هذا الإجراء نهائي. لتأكيد الحذف، اكتب كلمة "<b>{DELETE_CONFIRM_WORD}</b>" في
              الحقل بالأسفل.
            </p>

            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRM_WORD}
              disabled={deletingAccount}
              className="delete-modal__input"
              autoFocus
            />

            {deleteError ? <div className="auth-alert auth-alert--error">{deleteError}</div> : null}

            <div className="delete-modal__actions">
              <button type="button" className="ghost-button" onClick={closeDeleteModal} disabled={deletingAccount}>
                إلغاء
              </button>
              <button
                type="button"
                className="delete-modal__confirm"
                onClick={handleDeleteAccount}
                disabled={deletingAccount || deleteConfirmText !== DELETE_CONFIRM_WORD}
              >
                {deletingAccount ? (
                  <>
                    <Loader2 size={15} className="spin" />
                    جارٍ الحذف...
                  </>
                ) : (
                  'حذف الحساب نهائيًا'
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
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
              : mode === 'forgot-verify'
                ? 'أدخل كود التحقق'
                : mode === 'reset'
                  ? 'كلمة مرور جديدة'
                  : mode === 'verify'
                    ? 'تحقق من بريدك'
                    : 'أهلًا بك في دار الفتح'}
          </h1>
          <p>
            {mode === 'verify'
              ? 'أرسلنا كود مكوّن من 6 أرقام إلى بريدك الإلكتروني. أدخله لتأكيد حسابك والبدء في التسوق.'
              : mode === 'forgot'
                ? 'أدخل بريدك الإلكتروني وسنرسل لك كود تحقق مكوّن من 6 أرقام لإعادة تعيين كلمة المرور.'
                : mode === 'forgot-verify'
                  ? 'أرسلنا كود تحقق مكوّن من 6 أرقام إلى بريدك. أدخله لتأكيد هويتك واختيار كلمة مرور جديدة.'
                  : mode === 'reset'
                    ? 'اختر كلمة مرور جديدة قوية لحماية حسابك.'
                    : 'سجّل حسابك في دقيقة وتمتع بتجربة تسوق مريحة وآمنة — تابع طلباتك واحفظ مفضلتك في أي وقت.'}
          </p>

          <div className="auth-benefits">
            <div>
              <ShieldCheck size={17} />
              حساب شخصي آمن ومشفّر
            </div>
            <div>
              <PackageCheck size={17} />
              متابعة حالة طلباتك
            </div>
            <div>
              <Download size={17} />
              تحميل الكتب الرقمية
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
                  : mode === 'forgot-verify'
                    ? 'كود إعادة التعيين'
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
                readOnly={mode === 'forgot-verify'}
                className={mode === 'forgot-verify' ? 'auth-input--readonly' : ''}
              />
            </label>
          ) : null}

          {mode === 'verify' ? (
            <label>
              كود التحقق
              <OtpInput
                value={form.verificationCode}
                onChange={(val) => updateField('verificationCode', val)}
                disabled={submitting}
              />
            </label>
          ) : null}

          {mode === 'forgot-verify' ? (
            <label>
              كود إعادة التعيين
              <OtpInput
                value={form.verificationCode}
                onChange={(val) => updateField('verificationCode', val)}
                disabled={submitting}
              />
            </label>
          ) : null}

          {mode !== 'forgot' && mode !== 'forgot-verify' && mode !== 'verify' ? (
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
                      ? 'إرسال كود التحقق'
                      : mode === 'forgot-verify'
                        ? 'تأكيد الكود'
                        : 'حفظ كلمة المرور الجديدة'}
          </button>

          {mode === 'verify' ? (
            <p className="auth-footnote">
              لم يصلك الكود؟{' '}
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={submitting || resendCooldown > 0}
              >
                {resendCooldown > 0 ? `إعادة الإرسال (${resendCooldown}ث)` : 'إعادة إرسال التحقق'}
              </button>
              <br />
              <small className="auth-otp-expiry">صلاحية الكود 5 دقائق</small>
            </p>
          ) : null}

          {mode === 'forgot-verify' ? (
            <p className="auth-footnote">
              لم يصلك الكود؟{' '}
              <button
                type="button"
                onClick={handleResendResetOtp}
                disabled={submitting || resendCooldown > 0}
              >
                {resendCooldown > 0 ? `إعادة الإرسال (${resendCooldown}ث)` : 'إعادة إرسال كود التحقق'}
              </button>
              <br />
              <small className="auth-otp-expiry">صلاحية الكود 5 دقائق</small>
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
