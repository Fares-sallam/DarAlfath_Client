-- ══════════════════════════════════════════════════════════════════════════
-- Weight + governorate based shipping pricing.
--
-- Adds:
--   - product_variants.weight_kg: per-variant shipping weight, defaulted to
--     0.3kg for every existing row (a reasonable single-book estimate) so
--     nothing breaks; admins can refine per book from the dashboard.
--   - shipping_rates: (shipping_company_id, governorate, weight range) ->
--     price. Seeded with Bosta's real published rates (bosta.co/ar-eg/pricing,
--     verified live 2026-08-20), which price by 4 geographic zones rather
--     than per-governorate, up to a 20kg cap per shipment (Bosta's own
--     published limit for a single standard parcel regardless of weight
--     below that — no finer public weight tiers exist below the cap). Every
--     one of Egypt's 27 governorates is mapped to its zone below (Cairo +
--     Giza + Qalyubia = Cairo zone; Alexandria on its own; Delta/Canal
--     governorates grouped; Upper Egypt + Red Sea + Sinai + Matrouh grouped
--     as the remote zone) — this governorate -> zone grouping is our own
--     logical assignment (Bosta's public pricing page doesn't itself list
--     it), editable per governorate from the dashboard if it needs
--     correcting, and extensible with more weight tiers later (e.g. past
--     20kg) or other shipping companies.
--   - store_settings.default_shipping_company_id: which company's rate
--     table drives the automatic checkout-time shipping calculation. Order
--     creation falls back to the existing flat default_shipping_cost when
--     no matching rate exists (missing governorate, weight out of range, no
--     default company set, etc.) — this system only ever narrows the flat
--     rate, never removes it as a safety net.
-- ══════════════════════════════════════════════════════════════════════════

-- ── product_variants.weight_kg ──────────────────────────────────────────────
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS weight_kg numeric NOT NULL DEFAULT 0.3;

-- ── shipping_rates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_company_id uuid NOT NULL REFERENCES public.shipping_companies(id) ON DELETE CASCADE,
  governorate text NOT NULL,
  weight_from_kg numeric NOT NULL DEFAULT 0,
  weight_to_kg numeric,               -- null = no upper bound
  price numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipping_company_id, governorate, weight_from_kg)
);

CREATE INDEX IF NOT EXISTS idx_shipping_rates_lookup
  ON public.shipping_rates (shipping_company_id, governorate, weight_from_kg);

ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;

-- Admin-only writes, same pattern as every isadmin_full_* policy this
-- session's security work established.
DROP POLICY IF EXISTS "isadmin_full_shipping_rates" ON public.shipping_rates;
CREATE POLICY "isadmin_full_shipping_rates" ON public.shipping_rates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Public read: the real checkout-time calculation runs server-side via the
-- service-role client (bypasses RLS entirely) — this is only for any future
-- client-side estimate read, and is harmless since prices/weight tiers
-- aren't sensitive (matches shipping_companies' own public-read policy).
DROP POLICY IF EXISTS "public_read_shipping_rates" ON public.shipping_rates;
CREATE POLICY "public_read_shipping_rates" ON public.shipping_rates
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Keep the default command grants tight from day one — no blanket
-- anon/authenticated write access, only what the policy above allows.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.shipping_rates FROM anon, authenticated;
GRANT SELECT ON public.shipping_rates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shipping_rates TO authenticated;

-- ── store_settings.default_shipping_company_id ─────────────────────────────
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS default_shipping_company_id uuid REFERENCES public.shipping_companies(id);

-- ── Seed: Bosta's real published Egypt rates, by governorate ───────────────
DO $$
DECLARE
  v_bosta_id uuid;
BEGIN
  SELECT id INTO v_bosta_id FROM public.shipping_companies WHERE company_name = 'بوسطة' LIMIT 1;

  IF v_bosta_id IS NOT NULL THEN
    INSERT INTO public.shipping_rates (shipping_company_id, governorate, weight_from_kg, weight_to_kg, price)
    VALUES
      -- Cairo zone (97)
      (v_bosta_id, 'القاهرة',       0, 20, 97),
      (v_bosta_id, 'الجيزة',        0, 20, 97),
      (v_bosta_id, 'القليوبية',     0, 20, 97),
      -- Alexandria zone (102)
      (v_bosta_id, 'الإسكندرية',    0, 20, 102),
      -- Delta & Canal zone (110)
      (v_bosta_id, 'الدقهلية',      0, 20, 110),
      (v_bosta_id, 'الشرقية',       0, 20, 110),
      (v_bosta_id, 'الغربية',       0, 20, 110),
      (v_bosta_id, 'المنوفية',      0, 20, 110),
      (v_bosta_id, 'كفر الشيخ',     0, 20, 110),
      (v_bosta_id, 'البحيرة',       0, 20, 110),
      (v_bosta_id, 'دمياط',         0, 20, 110),
      (v_bosta_id, 'الإسماعيلية',   0, 20, 110),
      (v_bosta_id, 'السويس',        0, 20, 110),
      (v_bosta_id, 'بورسعيد',       0, 20, 110),
      -- Upper Egypt & Red Sea zone (124) — Sinai/Matrouh grouped in as the
      -- remote zone too
      (v_bosta_id, 'الفيوم',        0, 20, 124),
      (v_bosta_id, 'بني سويف',      0, 20, 124),
      (v_bosta_id, 'المنيا',        0, 20, 124),
      (v_bosta_id, 'أسيوط',         0, 20, 124),
      (v_bosta_id, 'سوهاج',         0, 20, 124),
      (v_bosta_id, 'قنا',           0, 20, 124),
      (v_bosta_id, 'الأقصر',        0, 20, 124),
      (v_bosta_id, 'أسوان',         0, 20, 124),
      (v_bosta_id, 'البحر الأحمر',  0, 20, 124),
      (v_bosta_id, 'الوادي الجديد', 0, 20, 124),
      (v_bosta_id, 'مطروح',         0, 20, 124),
      (v_bosta_id, 'شمال سيناء',    0, 20, 124),
      (v_bosta_id, 'جنوب سيناء',    0, 20, 124)
    ON CONFLICT (shipping_company_id, governorate, weight_from_kg) DO NOTHING;

    UPDATE public.store_settings SET default_shipping_company_id = v_bosta_id;
  END IF;
END $$;
