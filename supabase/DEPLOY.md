# خطوات نشر نظام إدارة المخزون

## 1. تشغيل SQL Migration في Supabase

افتح **Supabase Dashboard → SQL Editor** وانسخ محتوى الملف:

```
supabase/migrations/001_stock_management.sql
```

ثم اضغط **Run** — سيُنشئ:
- دالة `create_order_with_stock_deduction` (transaction واحد = آمن من race conditions)
- Trigger `trg_restore_stock_on_cancellation` (يُعيد المخزون تلقائياً عند الإلغاء)
- Constraint يمنع المخزون من الانخفاض لأقل من صفر

## 2. نشر Edge Function

### باستخدام Supabase CLI:
```bash
# تثبيت CLI (إن لم يكن موجوداً)
npm install -g supabase

# تسجيل الدخول
supabase login

# ربط المشروع (استبدل PROJECT_REF بمعرّف مشروعك)
supabase link --project-ref tpwjhkbzppsruboygmzm

# نشر الدالة
supabase functions deploy create-storefront-order --no-verify-jwt
```

### أو يدوياً من Dashboard:
افتح **Supabase Dashboard → Edge Functions → New Function**
واسمها: `create-storefront-order`
ثم انسخ محتوى: `supabase/functions/create-storefront-order/index.ts`

## 3. التحقق من عمل المنظومة

### اختبار خصم المخزون:
1. أنشئ طلباً بكتاب ورقي عدد نسخه مثلاً 5
2. تحقق في `product_variants` → يجب أن يصبح `available_stock = 4`

### اختبار إعادة المخزون:
1. في لوحة التحكم، غيّر حالة الطلب إلى `cancelled`
2. تحقق في `product_variants` → يجب أن يعود `available_stock = 5`

### اختبار الحماية من race conditions:
- إذا كانت آخر نسخة متبقية وأرسل شخصان طلبين في نفس اللحظة
- سيُكمَل طلب واحد فقط، والآخر يحصل على رسالة: "المخزون غير كافٍ"

## 4. عمود download_url في order_items (اختياري)

لدعم روابط التحميل في DownloadsPage، أضف العمود:

```sql
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS download_url TEXT;
```

## 5. ملاحظات هامة

- **الكتب الرقمية** (`is_digital = true`): لا يُخصم منها مخزون أبداً
- **الكتب الورقية** (`is_digital = false`) فقط: يُخصم ويُعاد
- إذا كان `available_stock = NULL` للكتاب الورقي: يعني مخزون غير محدود (لا خصم)
- `is_available` يتحول إلى `false` تلقائياً عند وصول المخزون لـ `0`
- `is_available` يتحول إلى `true` تلقائياً عند إعادة المخزون بعد الإلغاء
