-- Apply before deploying the dashboard that calls links_page_save.
-- One transaction protects the settings and block list from partial saves.

alter table public.links_page_settings
  drop constraint if exists links_page_settings_pattern_position_chk;
alter table public.links_page_settings
  add constraint links_page_settings_pattern_position_chk
  check (pattern_position in ('top', 'bottom', 'both'));

create or replace function public.links_page_save(
  p_settings jsonb,
  p_blocks jsonb,
  p_removed_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can save the links page' using errcode = '42501';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array'
     or jsonb_array_length(p_blocks) > 300
     or coalesce(array_length(p_removed_ids, 1), 0) > 300 then
    raise exception 'Invalid links page blocks' using errcode = '22023';
  end if;
  if p_settings is not null and jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Invalid links page settings' using errcode = '22023';
  end if;

  -- Serializes concurrent dashboard saves; the row already exists from the links-page migration.
  perform 1 from public.links_page_settings where id = 1 for update;
  if not found then
    raise exception 'Links page settings row is missing' using errcode = 'P0002';
  end if;

  if p_settings is not null then
    insert into public.links_page_settings (
      id, is_enabled, title, tagline, show_logo, button_shape, background,
      pattern_position, pattern_strength, footer_text, seo_title, seo_description, share_image_url
    )
    select 1, s.is_enabled, s.title, s.tagline, s.show_logo, s.button_shape, s.background,
      s.pattern_position, s.pattern_strength, s.footer_text, s.seo_title, s.seo_description, s.share_image_url
    from jsonb_to_record(p_settings) as s(
      is_enabled boolean, title text, tagline text, show_logo boolean, button_shape text,
      background text, pattern_position text, pattern_strength smallint, footer_text text,
      seo_title text, seo_description text, share_image_url text
    )
    on conflict (id) do update set
      is_enabled = excluded.is_enabled,
      title = excluded.title,
      tagline = excluded.tagline,
      show_logo = excluded.show_logo,
      button_shape = excluded.button_shape,
      background = excluded.background,
      pattern_position = excluded.pattern_position,
      pattern_strength = excluded.pattern_strength,
      footer_text = excluded.footer_text,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description,
      share_image_url = excluded.share_image_url;
  end if;

  if jsonb_array_length(p_blocks) > 0 then
    insert into public.links_page_blocks (
      id, kind, sort_order, is_active, starts_at, ends_at, title, body, url,
      cta_label, image_url, icon, badge, coupon_code, look
    )
    select b.id, b.kind, b.sort_order, b.is_active, b.starts_at, b.ends_at,
      b.title, b.body, b.url, b.cta_label, b.image_url, b.icon, b.badge, b.coupon_code, b.look
    from jsonb_to_recordset(p_blocks) as b(
      id uuid, kind text, sort_order integer, is_active boolean, starts_at timestamptz,
      ends_at timestamptz, title text, body text, url text, cta_label text,
      image_url text, icon text, badge text, coupon_code text, look jsonb
    )
    on conflict (id) do update set
      kind = excluded.kind,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      title = excluded.title,
      body = excluded.body,
      url = excluded.url,
      cta_label = excluded.cta_label,
      image_url = excluded.image_url,
      icon = excluded.icon,
      badge = excluded.badge,
      coupon_code = excluded.coupon_code,
      look = excluded.look;
  end if;

  if coalesce(array_length(p_removed_ids, 1), 0) > 0 then
    delete from public.links_page_blocks where id = any(p_removed_ids);
  end if;
end;
$$;

revoke all on function public.links_page_save(jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.links_page_save(jsonb, jsonb, uuid[]) to authenticated;
