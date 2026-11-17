-- The links page pattern can now sit at the top, the bottom, or both ("both" is new).
-- Only the allowed values of links_page_settings.pattern_position change; the default stays 'top'.
-- Purely additive: every existing row ('top' or 'bottom') is still valid.
alter table public.links_page_settings drop constraint if exists links_page_settings_pattern_position_chk;
alter table public.links_page_settings
  add constraint links_page_settings_pattern_position_chk check (pattern_position in ('top', 'bottom', 'both'));

comment on column public.links_page_settings.pattern_position is
  'Where the brand pattern sits behind the links page: fading down from the top, rising from the bottom, or both.';
