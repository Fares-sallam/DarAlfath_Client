-- ══════════════════════════════════════════════════════════════════════════
-- Bosta's "heavy package" tier (الحزم الثقيلة) — covers carts whose total
-- weight exceeds the 20kg cap the standard tier (seeded in
-- 20260820_weight_governorate_shipping_rates.sql) is priced for. Without
-- this, a cart over 20kg fell through to the flat store-wide rate instead
-- of Bosta's real pricing for that case.
--
-- Real published rates (bosta.co/ar-eg/pricing, verified live 2026-08-20):
--   Cairo zone: 564 | Alexandria zone: 614 | Delta & Canal zone: 694 |
--   Upper Egypt & Red Sea zone: 834
--
-- weight_from_kg starts at 20.001 (not 20) so a cart at exactly 20kg still
-- resolves to the standard tier's price, and only strictly-over-20kg carts
-- fall into this one — matches the standard tier's own inclusive 20kg cap
-- with no overlap or gap at the boundary. No upper bound.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_bosta_id uuid;
BEGIN
  SELECT id INTO v_bosta_id FROM public.shipping_companies WHERE company_name = 'بوسطة' LIMIT 1;

  IF v_bosta_id IS NOT NULL THEN
    INSERT INTO public.shipping_rates (shipping_company_id, governorate, weight_from_kg, weight_to_kg, price)
    VALUES
      -- Cairo zone (564)
      (v_bosta_id, 'القاهرة',       20.001, NULL, 564),
      (v_bosta_id, 'الجيزة',        20.001, NULL, 564),
      (v_bosta_id, 'القليوبية',     20.001, NULL, 564),
      -- Alexandria zone (614)
      (v_bosta_id, 'الإسكندرية',    20.001, NULL, 614),
      -- Delta & Canal zone (694)
      (v_bosta_id, 'الدقهلية',      20.001, NULL, 694),
      (v_bosta_id, 'الشرقية',       20.001, NULL, 694),
      (v_bosta_id, 'الغربية',       20.001, NULL, 694),
      (v_bosta_id, 'المنوفية',      20.001, NULL, 694),
      (v_bosta_id, 'كفر الشيخ',     20.001, NULL, 694),
      (v_bosta_id, 'البحيرة',       20.001, NULL, 694),
      (v_bosta_id, 'دمياط',         20.001, NULL, 694),
      (v_bosta_id, 'الإسماعيلية',   20.001, NULL, 694),
      (v_bosta_id, 'السويس',        20.001, NULL, 694),
      (v_bosta_id, 'بورسعيد',       20.001, NULL, 694),
      -- Upper Egypt & Red Sea zone (834)
      (v_bosta_id, 'الفيوم',        20.001, NULL, 834),
      (v_bosta_id, 'بني سويف',      20.001, NULL, 834),
      (v_bosta_id, 'المنيا',        20.001, NULL, 834),
      (v_bosta_id, 'أسيوط',         20.001, NULL, 834),
      (v_bosta_id, 'سوهاج',         20.001, NULL, 834),
      (v_bosta_id, 'قنا',           20.001, NULL, 834),
      (v_bosta_id, 'الأقصر',        20.001, NULL, 834),
      (v_bosta_id, 'أسوان',         20.001, NULL, 834),
      (v_bosta_id, 'البحر الأحمر',  20.001, NULL, 834),
      (v_bosta_id, 'الوادي الجديد', 20.001, NULL, 834),
      (v_bosta_id, 'مطروح',         20.001, NULL, 834),
      (v_bosta_id, 'شمال سيناء',    20.001, NULL, 834),
      (v_bosta_id, 'جنوب سيناء',    20.001, NULL, 834)
    ON CONFLICT (shipping_company_id, governorate, weight_from_kg) DO NOTHING;
  END IF;
END $$;
