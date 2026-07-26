begin;

-- Information requests sent by dealers from the /registrazione page.
-- Until now the endpoint only emailed info@keyauto.it, so a provider failure
-- (Resend is still under its warm-up sending cap) meant the enquiry was lost.
-- Persisting it first makes the email a notification rather than the only copy.
create table if not exists public.dealer_info_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists dealer_info_requests_created_at_idx
  on public.dealer_info_requests (created_at desc);

-- Only server-side code holding the service-role key touches this table: the
-- public endpoint writes with it, the admin endpoint reads with it. So lock it
-- to service_role entirely, matching the dealer_demo_subscriptions/audit_logs
-- pattern -- no anon or authenticated grant is needed, and PostgREST cannot
-- reach it directly.
alter table public.dealer_info_requests enable row level security;
alter table public.dealer_info_requests force row level security;

revoke all on public.dealer_info_requests from public, anon, authenticated;
grant all on public.dealer_info_requests to service_role;

drop policy if exists dealer_info_requests_service_role_all on public.dealer_info_requests;

create policy dealer_info_requests_service_role_all
on public.dealer_info_requests
for all
to service_role
using (true)
with check (true);

commit;
