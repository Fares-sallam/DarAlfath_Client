-- Admin-manageable "من الدار" intro videos on the homepage. Previously
-- hardcoded in src/data/introVideos.ts as 3 entries all pointing at the
-- same placeholder YouTube link (dQw4w9WgXcQ — Rickroll) with a
-- description literally saying "replace this with a real video" — never
-- replaced, live on the homepage. Mirrors home_hero_slides' shape/RLS
-- exactly (same admin-list-content pattern), minus a storage bucket since
-- this only stores a YouTube URL, not an uploaded file.

create table if not exists public.intro_videos (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  youtube_url text not null,
  duration    text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.intro_videos is
  'Admin-managed YouTube videos shown in the homepage "من الدار" section.';

alter table public.intro_videos enable row level security;

-- Storefront: only active videos, orderable by sort_order.
create policy "public_read_active_intro_videos"
  on public.intro_videos
  for select
  to anon, authenticated
  using (is_active = true);

-- Dashboard: full control for admins only.
create policy "isadmin_full_intro_videos"
  on public.intro_videos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists intro_videos_sort_idx
  on public.intro_videos (sort_order) where is_active = true;

create or replace function public.set_intro_videos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_intro_videos_updated_at on public.intro_videos;
create trigger trg_intro_videos_updated_at
  before update on public.intro_videos
  for each row execute function public.set_intro_videos_updated_at();
