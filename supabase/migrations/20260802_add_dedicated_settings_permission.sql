-- ══════════════════════════════════════════════════════════════════════════
-- Better solution for the /settings route gate applied 2026-08-02: that fix
-- reused can_manage_admins (the closest existing permission) because no
-- dedicated "manage store settings" permission existed. can_manage_admins
-- is a much higher-trust permission (lets someone grant/revoke OTHER
-- staff's access) than "can edit store settings/payment methods/countries",
-- so overloading it either over-restricts (a settings-only staffer needs
-- full admin-management rights just to edit shipping cost) or, if granted
-- loosely, over-exposes admin management to someone who only needed
-- settings access. Adding a real, separate permission column instead.
--
-- Purely additive: new column defaults to false for every existing row, so
-- no current admin gains or silently keeps access via this column alone —
-- existing behavior for every already-granted permission is unchanged.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS can_manage_settings boolean NOT NULL DEFAULT false;

-- ── NOT dropped (checked before assuming "redundant" = safe to remove):
--    "adminsettings_admin_all"/"adminsettings_select" look like duplicates
--    of the newer can_manage_admins()-based policies, but can_manage_admins()
--    only checks is_system_owner() OR admin_settings.can_manage_admins=true
--    — it does NOT check profiles.role at all. Live check found one real
--    staff member (profiles.role='admin', admin_settings.can_manage_admins
--    = false) who currently depends on these two legacy policies for their
--    admin_settings access. Dropping them would have been a real regression
--    for a real person — left in place. Revisit only after confirming with
--    the owner whether that person's admin_settings.can_manage_admins should
--    actually be true (in which case the legacy policies become truly dead
--    and safe to drop), not by assuming.
