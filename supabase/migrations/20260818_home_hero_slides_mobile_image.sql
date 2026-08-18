-- home_hero_slides: optional separate image for narrow viewports.
--
-- The desktop banner (image_url) is typically a wide landscape graphic —
-- fine at desktop widths, but cramped or awkwardly cropped on a phone.
-- image_url_mobile lets the admin upload a second, phone-shaped version
-- of the same slide; the storefront picks whichever fits via a <picture>
-- element. Nullable and additive only — existing slides (and any slide
-- where the admin skips the mobile upload) keep showing image_url on
-- every screen size exactly as before.

alter table public.home_hero_slides
  add column if not exists image_url_mobile text;
