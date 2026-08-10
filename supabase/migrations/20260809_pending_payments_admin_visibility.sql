-- Make pending_payments readable by the dashboard's admins, not just one
-- hardcoded email.
--
-- `admin_full_pending_payments` was pinned to 'faresalsaid780@gmail.com'
-- literally. The owner could read the table; every other admin/manager got
-- zero rows with no error — a silently empty screen, which is worse than a
-- refusal. Every other table in this project already gates on is_admin()
-- (which still covers that same owner email, plus role-based admins and
-- admin_settings staff), so this brings the last outlier in line.
--
-- Payment secrets stay out of reach regardless: the dashboard selects an
-- explicit column list and never requests paymob_client_secret or
-- client_secret_hash. This policy only changes WHO may read, not WHAT.
begin;

drop policy if exists "admin_full_pending_payments" on public.pending_payments;

create policy "isadmin_full_pending_payments"
  on public.pending_payments
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
