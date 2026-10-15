-- ══════════════════════════════════════════════════════════════════════════
-- Comments open to every customer, shown once the store approves them.
--
-- Before: only a signed-in customer with a delivered order of the book
-- could review it, and the review went live at once (an admin could hide it
-- afterwards). Now anyone can leave a name, a rating and a comment — through
-- the submit-review edge function, which a visitor reaches without an
-- account — and nothing shows on the store until it is approved in the
-- dashboard (تقييمات العملاء).
--
--   • status: pending → approved / hidden. New and edited reviews by anyone
--     but an admin are pending, whatever the request says (trigger below).
--   • is_hidden stays, kept equal to (status <> 'approved'), so the mobile
--     app and older code that read or set it keep working.
--   • user_id is optional (a visitor has none). A signed-in customer still
--     has one review per book (the unique (product_id, user_id) stays; a
--     visitor's null user_id isn't caught by it).
--   • is_verified_buyer: set by the database when the reviewer is signed in
--     and has a delivered order with the book, shown as "مشتري موثّق".
--
-- The app's own path (a signed-in buyer writing straight into the table)
-- keeps working unchanged; its reviews now wait for approval too.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.product_reviews
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'hidden')),
  add column if not exists is_verified_buyer boolean not null default false;

-- Reviews already on the store stay as they were.
update public.product_reviews set status = case when is_hidden then 'hidden' else 'approved' end;

alter table public.product_reviews alter column user_id drop not null;
alter table public.product_reviews alter column is_hidden set default true;

alter table public.product_reviews
  add constraint product_reviews_name_length check (char_length(btrim(reviewer_name)) between 1 and 60) not valid,
  add constraint product_reviews_comment_length check (comment is null or char_length(comment) <= 1000) not valid;

create index if not exists product_reviews_status_idx on public.product_reviews (status, created_at desc);

-- ── Moderation and the verified-buyer mark, decided here and nowhere else ──
create or replace function public.product_reviews_moderate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin boolean := public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not admin then
      new.status := 'pending';
    end if;
  else
    if admin then
      -- Older dashboard code sets is_hidden alone: read it as the status.
      if new.status is not distinct from old.status and new.is_hidden is distinct from old.is_hidden then
        new.status := case when new.is_hidden then 'hidden' else 'approved' end;
      end if;
    else
      -- A customer editing their review sends it back for approval; nothing else moves the status.
      if new.rating is distinct from old.rating
         or new.comment is distinct from old.comment
         or new.reviewer_name is distinct from old.reviewer_name then
        new.status := 'pending';
      else
        new.status := old.status;
      end if;
      new.is_verified_buyer := old.is_verified_buyer;
    end if;
  end if;

  if new.user_id is not null and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id or not admin) then
    new.is_verified_buyer := exists (
      select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.user_id = new.user_id
        and o.status = 'تم التوصيل'
        and oi.product_id = new.product_id
    );
  elsif new.user_id is null then
    new.is_verified_buyer := false;
  end if;

  new.is_hidden := new.status <> 'approved';
  return new;
end;
$$;

revoke all on function public.product_reviews_moderate() from public, anon, authenticated;

drop trigger if exists trg_product_reviews_moderate on public.product_reviews;
create trigger trg_product_reviews_moderate
  before insert or update on public.product_reviews
  for each row execute function public.product_reviews_moderate();

-- ── Who reads what ──────────────────────────────────────────────────────
drop policy if exists public_read_product_reviews on public.product_reviews;
create policy public_read_product_reviews on public.product_reviews
  for select to anon, authenticated
  using (status = 'approved');

-- A signed-in customer also sees their own review while it waits.
drop policy if exists customer_read_own_review on public.product_reviews;
create policy customer_read_own_review on public.product_reviews
  for select to authenticated
  using (auth.uid() = user_id);

-- ── Ratings shown on the store count approved reviews only ─────────────────
create or replace view public.product_review_stats
  with (security_invoker = true) as
select
  product_id,
  count(*)::int as reviews_count,
  round(avg(rating)::numeric, 1) as avg_rating
from public.product_reviews
where status = 'approved'
group by product_id;

grant select on public.product_review_stats to anon, authenticated;
