begin;

-- Security audit 2026-07-20: dealers_update_own (20260628_saas_multi_dealer_profile.sql)
-- only scopes WHICH ROW a dealer member can update (id = current_dealer_id()), not WHICH
-- COLUMNS -- and `grant select, update on public.dealers to authenticated` is a full-table
-- grant. A dealer member could self-write status/plan/demo lifecycle fields directly (e.g.
-- set subscription_status = 'paid' or extend their own demo_expires_at), bypassing the
-- service_role-only demo activation/conversion RPCs.
--
-- Original attempt used a BEFORE UPDATE trigger keyed on session_user, but local testing
-- (see conversation) showed session_user does not reliably distinguish an authenticated
-- PostgREST request from a service_role one, and current_user changes to the function
-- owner inside the SECURITY DEFINER RPCs that legitimately write these columns (e.g.
-- convert_demo_request_atomic) -- neither approach is safe. Switching to the same
-- column-restricted GRANT pattern already used for profiles
-- (20260717000013_profiles_restrict_self_update_columns.sql) and dealer_users
-- (20260717000003): service_role is unaffected by grants to `authenticated`, so this
-- closes the hole with no risk to the legitimate admin/RPC write paths. Client code only
-- ever writes business-profile fields (see src/app/profilo/page.tsx) -- verified against
-- a local Postgres instance that this exact set still allows that save flow and blocks a
-- direct write to subscription_status.
revoke update on public.dealers from authenticated;
grant update (
  name, legal_name, vat_number, contact_person, email, phone, whatsapp_phone,
  address, city, province, zip_code, postal_code, website, logo_url, description,
  opening_hours, facebook_url, instagram_url, linkedin_url, social_links, updated_at
) on public.dealers to authenticated;

commit;
