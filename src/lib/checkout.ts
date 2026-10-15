/**
 * The checkout's three steps and what each needs before the next: 1) who (name, mobile, email if wanted),
 * 2) where (governorate, city, address), 3) payment. The mobile number is checked the way the order
 * functions check it (create-storefront-order / initiate-paymob-payment), so what passes here passes there.
 */

export type CheckoutStep = 1 | 2 | 3;

export type CheckoutForm = {
  fullName: string;
  email: string;
  phone: string;
  governorate: string;
  city: string;
  address: string;
  notes: string;
};

export const EMPTY_CHECKOUT: CheckoutForm = { fullName: '', email: '', phone: '', governorate: '', city: '', address: '', notes: '' };

/** Name, father's name and family name: what the courier needs on the parcel. */
export const isTripleName = (name: string) => name.trim().split(/\s+/).filter(Boolean).length >= 3;

/** Arabic or Persian digits to plain ones, spaces and dashes out, +20 / 0020 / 20 to a leading 0. */
export function normalizePhone(raw: string): string {
  let p = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\s\-().]/g, '');
  if (p.startsWith('+20')) p = '0' + p.slice(3);
  else if (p.startsWith('0020')) p = '0' + p.slice(4);
  else if (/^20\d{10}$/.test(p)) p = '0' + p.slice(2);
  return p;
}

export function phoneError(raw: string, countryCode?: string | null): string | null {
  if (!raw.trim()) return 'اكتب رقم الموبايل.';
  const phone = normalizePhone(raw);
  const egypt = !countryCode || countryCode.toUpperCase() === 'EG';
  if (egypt ? /^01[0125]\d{8}$/.test(phone) : /^\+?\d{7,15}$/.test(phone)) return null;
  return egypt ? 'رقم الموبايل غير صحيح: اكتبه 11 رقمًا يبدأ بـ 01.' : 'رقم الهاتف غير صحيح.';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is missing or wrong in a step, field by field (empty when the step is complete). */
export function stepErrors(step: CheckoutStep, form: CheckoutForm, countryCode?: string | null): Partial<Record<keyof CheckoutForm, string>> {
  const errors: Partial<Record<keyof CheckoutForm, string>> = {};
  if (step === 1) {
    if (!form.fullName.trim()) errors.fullName = 'اكتب اسمك.';
    else if (!isTripleName(form.fullName)) errors.fullName = 'اكتب الاسم ثلاثيًا (الاسم الأول واسم الأب واسم العائلة).';
    const phone = phoneError(form.phone, countryCode);
    if (phone) errors.phone = phone;
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = 'البريد الإلكتروني غير صحيح.';
  }
  if (step === 2) {
    if (!form.governorate) errors.governorate = 'اختر المحافظة.';
    if (!form.city) errors.city = 'اختر المدينة.';
    if (!form.address.trim()) errors.address = 'اكتب العنوان بالتفصيل.';
  }
  return errors;
}

/** The first step that isn't complete yet (3 when the details are all in). */
export function firstIncompleteStep(form: CheckoutForm, countryCode?: string | null): CheckoutStep {
  if (Object.keys(stepErrors(1, form, countryCode)).length) return 1;
  if (Object.keys(stepErrors(2, form, countryCode)).length) return 2;
  return 3;
}
