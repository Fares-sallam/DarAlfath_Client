# ملاحظات معمارية — متجر دار الفتح

وثيقة مرجعية للقرارات المعمارية والمقايضات (trade-offs) المتعمّدة في النظام.

---

## نموذج المخزون وتدفقات الدفع

النظام يدعم مسارين للدفع، يتعاملان مع المخزون بشكل **مختلف عمدًا**:

### 1. الدفع عند الاستلام (COD) — خصم فوري
```
create-storefront-order
  └─► create_order_with_stock_deduction (RPC معاملي واحد)
        • ينشئ الطلب + يخصم المخزون ذرّيًا في transaction واحد
        • constraint يمنع المخزون < 0  ← آمن ضد race conditions
```
المخزون يُخصم **لحظة تأكيد الطلب**. آمن تمامًا.

### 2. Paymob — خصم مؤجَّل حتى نجاح الدفع
```
initiate-paymob-payment
  └─► create_pending_payment        ← "no stock side-effects" (لا يحجز مخزونًا)
        • يحفظ السلة + العميل في pending_payments فقط
        • يولّد merchant_order_id ويعيد رابط Paymob iframe

[العميل يدفع على Paymob]

paymob-webhook / check-paymob-transaction
  └─► complete_pending_payment
        └─► create_order_with_stock_deduction   ← المخزون يُخصم هنا فقط
```
المخزون يُخصم **فقط عند نجاح الدفع**، وليس أثناء انتظار العميل على بوابة Paymob.

---

## ⚠️ مقايضة متعمّدة: احتمال بيع زائد على آخر نسخة (Paymob فقط)

لأن مسار Paymob **لا يحجز المخزون** أثناء نافذة الدفع، يوجد سيناريو تزامن نادر:

```
آخر نسخة متبقية (available_stock = 1):
  عميل (أ) يبدأ دفع Paymob ──┐  لا حجز
  عميل (ب) يبدأ دفع Paymob ──┘  لا حجز
  كلاهما يكمل الدفع بنجاح على Paymob
        ↓
  webhook العميل (أ) → يخصم النسخة الأخيرة → الطلب ينجح ✅
  webhook العميل (ب) → create_order_with_stock_deduction يفشل (المخزون = 0)
        → الـ webhook يرجع HTTP 500 → Paymob يعيد المحاولة
        → لكنها تظل تفشل لأن المخزون فعلًا صفر
        → العميل (ب) دُفع منه دون إنشاء طلب ⚠️
```

### لماذا هذا مقبول حاليًا
- تزامن شراء **نفس آخر نسخة** عبر **Paymob تحديدًا** في نفس اللحظة = نادر جدًا لمتجر بهذا الحجم.
- البديل (حجز فعلي) يضيف تعقيد reserve/release كامل وحالات حافة أكثر.
- المقايضة: **تجنّب التعقيد** مقابل **قبول بيع زائد نادر على آخر نسخة**.

### المتابعة المطلوبة
راقب فشل `complete_pending_payment` (يظهر كـ HTTP 500 في لوجات `paymob-webhook`).
لو تكرر الفشل بسبب نفاد المخزون، يعني السيناريو حدث وعميل دُفع منه دون طلب →
يجب **استرداد المبلغ يدويًا** من لوحة Paymob أو إبلاغ العميل.

### الحل المستقبلي (عند زيادة التزامن)
إضافة حجز حقيقي:
- عمود `reserved_stock` على `product_inventory`.
- `create_pending_payment` يحجز (reserved += qty، بشرط available - reserved >= qty).
- `expire/cancel_pending_payment` يحرّر (reserved -= qty).
- `complete_pending_payment` يحوّل الحجز إلى خصم فعلي.

---

## دورة حياة pending_payments

| الحالة | المعنى | المخزون |
|---|---|---|
| `pending` | بانتظار دفع العميل على Paymob | لا تأثير |
| `completed` | الدفع نجح → أُنشئ الطلب | خُصم |
| `failed` / `cancelled` | الدفع فشل أو أُلغي | لا تأثير |
| `expired` | انتهت الصلاحية دون دفع | لا تأثير |

### تنظيف الحجوزات المنتهية (pg_cron)
المهمة `expire-stale-pending-payments` تعمل **كل 15 دقيقة**:
```sql
-- supabase/migrations/20260605_schedule_expire_pending_payments.sql
SELECT cron.schedule('expire-stale-pending-payments', '*/15 * * * *',
  $$ SELECT public.expire_stale_pending_payments(); $$);
```
**ملاحظة:** هذا **تنظيف وصيانة** (يبقّي الجدول مرتبًا ودقة التقارير) — وليس آلية
تحرير مخزون، لأن الحجوزات المعلّقة لا تحجز مخزونًا أصلًا.

---

## صيغة merchant_order_id

```
ORD-YYYYMMDD-<32 حرف hex>
مثال: ORD-20260605-f71a7a16ffc6427fbd071c1b4cf90462
```
اللاحقة = UUID كامل (128 بت) بلا شرطات. **غير قابلة للتخمين** عمدًا، لأن
`merchant_order_id` هو مفتاح البحث في endpoint عام بلا مصادقة
(`check-paymob-transaction`)، فلا يجوز أن يكون قابلًا للتعداد.

> سابقًا كانت اللاحقة 6 أحرف (24 بت) — قابلة للتعداد. صُحّحت في
> `initiate-paymob-payment` لاستخدام الـ UUID الكامل.
