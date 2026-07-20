begin;

-- Security audit 2026-07-20: dealer_demo_subscriptions (20260717000004) was created
-- without ever enabling row level security, and no migration granted or revoked table
-- privileges on it either. Every other sensitive table in this project (demo_requests,
-- audit_logs, dealer_users) explicitly revokes default anon/authenticated privileges --
-- this one never did, so under Supabase's default schema privileges it was reachable via
-- PostgREST by any authenticated (possibly anon) client with no dealer_id scoping at all,
-- bypassing the entire service_role-only demo lifecycle RPC pipeline built for it. Nothing
-- in the app reads/writes this table except server-side code using the service-role
-- client (src/app/api/admin/demo-requests/route.ts, src/lib/demo-lifecycle-http.ts), so
-- it can be locked to service_role only, matching the demo_requests/audit_logs pattern.
alter table public.dealer_demo_subscriptions enable row level security;
alter table public.dealer_demo_subscriptions force row level security;

revoke all on public.dealer_demo_subscriptions from public, anon, authenticated;
grant all on public.dealer_demo_subscriptions to service_role;

create policy dealer_demo_subscriptions_service_role_all
on public.dealer_demo_subscriptions
for all
to service_role
using (true)
with check (true);

commit;
