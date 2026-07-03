-- ══════════════════════════════════════════════════════════════════════════
-- إزالة جيل قديم كامل من دوال إنشاء/تأكيد الطلبات (قبل معمارية pending_payments
-- الحالية). كانت هذه الدوال تُنشئ صف orders مباشرةً بحالة "معلق" قبل نجاح
-- الدفع، ثم "تؤكّده" لاحقًا — نموذج مختلف تمامًا عن المسار الحيّ الحالي
-- (create_pending_payment → complete_pending_payment على جدول pending_payments
-- منفصل، المُختبَر والمُحصَّن طوال هذه الجلسة). تأكيد الحذف: 0 مراجع في أي من
-- Edge Functions أو كود الموقع/لوحة التحكم، ولا أي trigger/policy/دالة أخرى
-- (باستثناء الدوال الميتة نفسها فيما بينها).
--   • admin_update_order_state  — بديل معطّل لتحديث حالة الطلب من لوحة
--     التحكم؛ الحالي فعليًا: تحديث مباشر على جدول orders تحت RLS +
--     trigger manage_stock_on_order_status_change.
--   • create_order_pending_payment / confirm_online_payment /
--     cancel_pending_payment_order — الجيل القديم لثلاثي
--     create_pending_payment / complete_pending_payment /
--     cancel_pending_payment الحالي.
--   • reserve_order_inventory — كانت تُستدعى فقط من الدالتين أعلاه.
-- ══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_update_order_state(text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.confirm_online_payment(text, text);
DROP FUNCTION IF EXISTS public.cancel_pending_payment_order(text);
DROP FUNCTION IF EXISTS public.create_order_pending_payment(uuid, uuid, uuid, numeric, jsonb, text, jsonb);
DROP FUNCTION IF EXISTS public.reserve_order_inventory(text);
