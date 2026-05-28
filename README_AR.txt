هذه نسخة تنفيذ كاملة لتصميم متجر دار الفتح.
الخطوات:
1) فك الملف في مجلد جديد
2) افتح المجلد في VS Code
3) نفّذ npm install
4) أنشئ ملف .env.local
5) ضع داخله VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY
6) ضع VITE_AUTH_REDIRECT_ORIGIN كرابط صفحة البيع/واجهة العملاء، مثل:
   VITE_AUTH_REDIRECT_ORIGIN=https://your-store-domain.com
   أو أثناء التطوير:
   VITE_AUTH_REDIRECT_ORIGIN=http://127.0.0.1:5173
7) في Supabase Dashboard > Authentication > URL Configuration أضف:
   https://your-store-domain.com/account
   http://127.0.0.1:5173/account
   حسب الرابط المستخدم
8) لإظهار كود 6 أرقام في رسالة التحقق:
   افتح Supabase Dashboard > Authentication > Email Templates > Confirm signup
   وضع في قالب الرسالة:
   رمز التحقق الخاص بك هو: {{ .Token }}
   أو استخدم رابط التحقق:
   {{ .ConfirmationURL }}
9) اختياري لتحصين صفحة إتمام الطلب:
   - أنشئ موقع Cloudflare Turnstile
   - ضع مفتاح الواجهة في .env.local:
     VITE_TURNSTILE_SITE_KEY=your_turnstile_site_key
   - لا تضبط REQUIRE_TURNSTILE=true في Supabase إلا بعد نشر مفتاح الواجهة
10) في Supabase Edge Function Secrets اضبط:
   INTERNAL_FUNCTION_SECRET=قيمة_سرية_طويلة
   ولتفعيل Turnstile على السيرفر:
   REQUIRE_TURNSTILE=true
   TURNSTILE_SECRET_KEY=your_turnstile_secret_key
11) شغّل npm run dev
