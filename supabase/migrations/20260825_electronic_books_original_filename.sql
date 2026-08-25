-- The uploaded ebook file is always renamed to {productId}.{ext} in
-- storage (avoids path collisions), which means the admin dashboard had
-- no way to show what the admin actually uploaded — the storage path is
-- just a UUID, not a real filename. Keeping the original name lets the
-- dashboard show "kitab_alfath.pdf" instead of a blank "there's a file,
-- trust me" state.
alter table public.electronic_books
  add column if not exists original_filename text;
