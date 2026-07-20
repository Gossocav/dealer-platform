begin;

-- Security audit 2026-07-20: profiles_update_own (20260627_create_profiles_table.sql)
-- only scopes WHICH ROW a user can update (id = auth.uid()), not WHICH COLUMNS. Combined
-- with the blanket `grant select, update on public.profiles to authenticated` and no
-- protective trigger, any authenticated user could run
--   update public.profiles set role = 'admin', dealer_id = '<any dealer>' where id = auth.uid();
-- and succeed. Every /api/admin/* route trusts profiles.role as a fallback authorization
-- check when app_metadata.role isn't admin -- this was a full self-service privilege
-- escalation to platform admin. No client code in this repo writes anything on profiles
-- other than full_name/preferences (see src/app/profilo, src/app/impostazioni), so
-- narrowing the grant to those two columns closes the hole without breaking the app.
-- role/dealer_id/status remain writable only by service_role (used by the admin
-- activation flow in /api/admin/demo-requests).
revoke update on public.profiles from authenticated;
grant update (full_name, preferences) on public.profiles to authenticated;

commit;
