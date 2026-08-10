import { FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, Mail, MapPin, MessageSquareText, Phone } from 'lucide-react';
import { OrnamentDivider } from '@/components/Ornament';
import { useStoreSettings } from '@/hooks/useStorefront';

const STORAGE_KEY = 'daralfath_client_contact_messages';

const initialForm = {
  fullName: '',
  email: '',
  subject: '',
  message: '',
};

export default function ContactPage() {
  const { data: settings } = useStoreSettings();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(
      form.fullName.trim() &&
      form.email.trim() &&
      form.subject.trim() &&
      form.message.trim()
    ),
    [form]
  );

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
    setSubmitted(false);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!canSubmit) {
      setError('أكمل الاسم والبريد والموضوع والرسالة قبل الإرسال.');
      return;
    }

    const message = {
      ...form,
      createdAt: new Date().toISOString(),
    };

    try {
      const previous = localStorage.getItem(STORAGE_KEY);
      const rows = previous ? JSON.parse(previous) : [];
      const nextRows = Array.isArray(rows) ? [message, ...rows].slice(0, 30) : [message];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRows));
    } catch {
      setError('تعذر حفظ الرسالة محليًا. جرّب مرة أخرى.');
      return;
    }

    setForm(initialForm);
    setSubmitted(true);
  };

  return (
    <div className="page-sections">
      <section className="page-card">
        <div className="page-card__head">
          <div>
            <span className="page-kicker">تواصل معنا</span>
            <h1>يسعدنا سماعك</h1>
            <p>أرسل رسالتك من نفس الصفحة، وسنحفظها محليًا لحين ربط نموذج البريد أو لوحة الإدارة.</p>
          </div>
        </div>
        <OrnamentDivider />

        <div className="contact-layout">
          <form className="contact-card contact-form" onSubmit={handleSubmit}>
            <h3>أرسل رسالتك</h3>

            {submitted ? (
              <div className="auth-alert auth-alert--success">
                <CheckCircle2 size={16} />
                تم حفظ رسالتك بنجاح.
              </div>
            ) : null}

            {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}

            <input
              value={form.fullName}
              onChange={(event) => updateField('fullName', event.target.value)}
              placeholder="الاسم الكامل"
              autoComplete="name"
            />
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              placeholder="البريد الإلكتروني"
              autoComplete="email"
            />
            <input
              value={form.subject}
              onChange={(event) => updateField('subject', event.target.value)}
              placeholder="الموضوع"
            />
            <textarea
              value={form.message}
              onChange={(event) => updateField('message', event.target.value)}
              placeholder="اكتب رسالتك هنا..."
              rows={6}
            />
            <button type="submit" className="primary-button" disabled={!canSubmit}>
              <MessageSquareText size={16} />
              إرسال الرسالة
            </button>
          </form>

          <div className="contact-card contact-info-panel">
            <h3>بيانات التواصل</h3>
            <div>
              <Phone size={16} />
              <span>{settings?.store_phone || '+20 100 000 0000'}</span>
            </div>
            <div>
              <Mail size={16} />
              <span>{settings?.store_email || 'info@example.com'}</span>
            </div>
            <div>
              <MapPin size={16} />
              <span>{settings?.store_address || 'القاهرة - مصر'}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
