import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type AuthResult = {
  error: string | null;
  message?: string;
  /** True when signup auto-confirmed (no OTP needed) */
  autoConfirmed?: boolean;
};

export type AuthEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'PASSWORD_RECOVERY'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | null;

type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
};

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authEvent: AuthEvent;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  verifyEmailCode: (email: string, token: string) => Promise<AuthResult>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
  sendResetOtp: (email: string) => Promise<AuthResult>;
  verifyResetOtp: (email: string, token: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getArabicAuthError(message?: string) {
  const value = String(message || '').toLowerCase();

  if (value.includes('invalid login credentials')) {
    return 'بيانات الدخول غير صحيحة. تأكد من البريد وكلمة المرور.';
  }

  if (value.includes('rate') || value.includes('limit')) {
    return 'تم إرسال عدة طلبات خلال وقت قصير. انتظر دقيقة ثم حاول مرة أخرى.';
  }

  if (value.includes('token') || value.includes('otp')) {
    return 'الكود غير صحيح أو انتهت صلاحيته. اطلب كودًا جديدًا وحاول مرة أخرى.';
  }

  if (value.includes('user already registered') || value.includes('already been registered')) {
    return 'هذا البريد مسجل بالفعل. جرّب تسجيل الدخول بدل إنشاء حساب.';
  }

  if (value.includes('password')) {
    return 'كلمة المرور غير مقبولة. استخدم 6 أحرف على الأقل.';
  }

  if (value.includes('signup') && (value.includes('disabled') || value.includes('not allowed'))) {
    return 'التسجيل معطّل حالياً. تواصل مع إدارة الموقع.';
  }

  if (value.includes('smtp') || value.includes('magic link') || value.includes('sending')) {
    return 'فشل إرسال البريد الإلكتروني. حاول مرة أخرى أو تواصل مع إدارة الموقع.';
  }

  if ((value.includes('invalid') || value.includes('format')) && value.includes('email')) {
    return 'يرجى إدخال بريد إلكتروني صحيح.';
  }

  // Return the original Supabase message so the real cause is visible
  return message || 'حدث خطأ غير متوقع. حاول مرة أخرى.';
}

function getRedirectUrl(path: string) {
  const configuredOrigin = import.meta.env.VITE_AUTH_REDIRECT_ORIGIN as string | undefined;
  const fallbackOrigin = typeof window === 'undefined' ? undefined : window.location.origin;
  const origin = (configuredOrigin || fallbackOrigin || '').replace(/\/$/, '');
  return origin ? `${origin}${path}` : undefined;
}

const missingSupabaseMessage =
  'تسجيل الحسابات يحتاج ضبط مفاتيح Supabase في ملف .env.local أولًا.';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEvent, setAuthEvent] = useState<AuthEvent>(null);

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured) {
      setSession(null);
      setLoading(false);
      return undefined;
    }

    const loadSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        setLoading(false);
      } catch {
        if (!mounted) return;
        setSession(null);
        setLoading(false);
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthEvent(event as AuthEvent);
      setLoading(false);
    });

    void loadSession();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    loading,
    authEvent,
    signIn: async (email, password) => {
      if (!isSupabaseConfigured) return { error: missingSupabaseMessage };

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      return { error: error ? getArabicAuthError(error.message) : null };
    },
    signUp: async ({ email, password, fullName }) => {
      if (!isSupabaseConfigured) return { error: missingSupabaseMessage };

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: getRedirectUrl('/account?verified=1'),
          data: {
            full_name: fullName.trim(),
            has_password: true,
          },
        },
      });

      if (error) {
        return { error: getArabicAuthError(error.message) };
      }

      // When mailer_autoconfirm is enabled, Supabase returns a session
      // immediately — the user is already logged in, no OTP needed.
      const autoConfirmed = !!data.session;

      return {
        error: null,
        autoConfirmed,
        message: autoConfirmed
          ? 'تم إنشاء حسابك بنجاح! مرحبًا بك في دار الفتح.'
          : 'تم إنشاء حسابك! تحقق من بريدك الإلكتروني لتأكيد الحساب.',
      };
    },
    verifyEmailCode: async (email, token) => {
      if (!isSupabaseConfigured) return { error: missingSupabaseMessage };

      const cleanedToken = token.replace(/\D/g, '');
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanedToken,
        type: 'email',
        options: {
          redirectTo: getRedirectUrl('/account?verified=1'),
        },
      });

      if (error) {
        return { error: getArabicAuthError(error.message) };
      }

      return {
        error: null,
        message: 'تم تأكيد البريد بنجاح. يمكنك استخدام حسابك الآن.',
      };
    },
    resendConfirmation: async (email) => {
      if (!isSupabaseConfigured) return { error: missingSupabaseMessage };

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // false prevents ghost account creation via resend spam
          shouldCreateUser: false,
          emailRedirectTo: getRedirectUrl('/account?verified=1'),
        },
      });

      if (error) {
        const msg = error.message.toLowerCase();

        // Rate limit — tell the user clearly
        if (msg.includes('rate') || msg.includes('limit')) {
          return { error: getArabicAuthError(error.message) };
        }

        // Generic message to prevent email enumeration — don't reveal
        // whether the email is registered or not.
        return {
          error: null,
          message: `إذا كان البريد مسجلاً، سيصلك كود تحقق جديد إلى ${email.trim()}.`,
        };
      }

      return {
        error: null,
        message: `أرسلنا كود تحقق جديد إلى ${email.trim()}.`,
      };
    },
    sendResetOtp: async (email) => {
      if (!isSupabaseConfigured) return { error: missingSupabaseMessage };

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
        },
      });

      if (error) {
        const msg = error.message.toLowerCase();

        // Rate limit — tell the user clearly
        if (msg.includes('rate') || msg.includes('limit')) {
          return { error: getArabicAuthError(error.message) };
        }

        // For any other error (user not found, magic link failure, etc.)
        // return a generic success-looking message to prevent email enumeration.
        // An attacker should not be able to distinguish "user exists but email
        // failed" from "user does not exist".
        return {
          error: null,
          message: 'إذا كان هذا البريد مسجلاً لدينا، سيصلك كود التحقق خلال لحظات.',
        };
      }

      return {
        error: null,
        message: 'أرسلنا كود تحقق مكوّن من 6 أرقام إلى بريدك الإلكتروني.',
      };
    },
    verifyResetOtp: async (email, token) => {
      if (!isSupabaseConfigured) return { error: missingSupabaseMessage };

      const cleanedToken = token.replace(/\D/g, '');
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanedToken,
        type: 'email',
      });

      if (error) {
        return { error: getArabicAuthError(error.message) };
      }

      return {
        error: null,
        message: 'تم التحقق بنجاح. اختر كلمة مرور جديدة.',
      };
    },
    updatePassword: async (password) => {
      if (!isSupabaseConfigured) return { error: missingSupabaseMessage };

      const { error } = await supabase.auth.updateUser({ password });
      return {
        error: error ? getArabicAuthError(error.message) : null,
        message: 'تم تحديث كلمة المرور بنجاح. يمكنك استخدام كلمة المرور الجديدة الآن.',
      };
    },
    signOut: async () => {
      if (!isSupabaseConfigured) return { error: null };

      const { error } = await supabase.auth.signOut();
      return { error: error ? getArabicAuthError(error.message) : null };
    },
  }), [loading, session, authEvent]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
