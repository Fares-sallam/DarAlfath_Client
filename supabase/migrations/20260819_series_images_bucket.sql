-- Storage bucket for book_series.cover_url uploads.
--
-- "إدارة السلاسل" (dashboard) only had a plain text field for pasting an
-- already-hosted image URL — no way to actually upload one. Requested
-- explicitly: a real upload slot, matching the hero-images bucket set up
-- for home_hero_slides.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('series-images', 'series-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "isadmin_manage_series_images"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'series-images' and public.is_admin())
  with check (bucket_id = 'series-images' and public.is_admin());
