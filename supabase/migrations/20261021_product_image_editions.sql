-- Pictures per edition (2026-10-21).
--
-- A book sold in several editions (a size, say: A4 or 17x24) can have pictures of its own for each one.
-- `variant_id` says which edition a picture belongs to; empty means the book's own, for every edition.
--
--   * The book page shows an edition's own pictures when it has any; when it has none (or none is chosen
--     yet) it shows what the book has: the cover and every picture, whichever edition they belong to.
--   * The dashboard sets it from the book's picture gallery.
--   * A picture can only belong to an edition of its own book, and goes with the edition if that is deleted.
--
-- Nothing else changes: who can read and write pictures stays as it was.

alter table public.product_images
  add column if not exists variant_id uuid references public.product_variants (id) on delete cascade;

create index if not exists product_images_variant_id_idx
  on public.product_images (variant_id)
  where variant_id is not null;

comment on column public.product_images.variant_id is
  'The edition (product_variants.id) this picture belongs to; null = the book''s own picture, shown for every edition.';

create or replace function public.product_images_variant_of_same_product()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.variant_id is not null and not exists (
    select 1
      from public.product_variants v
     where v.id = new.variant_id
       and v.product_id = new.product_id
  ) then
    raise exception 'الطبعة المختارة ليست من هذا الكتاب.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists product_images_variant_of_same_product on public.product_images;
create trigger product_images_variant_of_same_product
  before insert or update of variant_id, product_id on public.product_images
  for each row execute function public.product_images_variant_of_same_product();
