-- Dark-mode variants of the homepage hero banner images. Design differs
-- enough between light/dark that a single image can't serve both — admin
-- can now optionally upload separate desktop + mobile images for dark
-- mode. Both are nullable: when unset, the storefront falls back to the
-- light-mode image (desktop falls back to image_url; mobile falls back to
-- image_url_dark, then image_url_mobile, then image_url — see
-- HeroShowcase.tsx).
alter table public.home_hero_slides
  add column if not exists image_url_dark text,
  add column if not exists image_url_mobile_dark text;
