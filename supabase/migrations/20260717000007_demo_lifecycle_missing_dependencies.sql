begin;

-- Every demo lifecycle RPC (20260717000005_demo_rpc_core.sql and
-- 20260717000006_demo_admin_lifecycle_atomic.sql) writes an audit trail row to
-- public.audit_logs, but no migration ever created that table: every RPC call
-- (configure_demo_profile, reserve_demo_activation, record_demo_activation_progress,
-- finalize_demo_activation, fail_demo_activation, transition_demo_lifecycle,
-- reject_demo_request_atomic) fails with "relation public.audit_logs does not exist"
-- before it can complete.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid references public.dealers(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_type text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  metadata_json jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_dealer_id_idx on public.audit_logs (dealer_id);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

drop policy if exists audit_logs_service_role_all on public.audit_logs;

revoke all on table public.audit_logs from anon;
revoke all on table public.audit_logs from authenticated;

grant select, insert, update, delete on table public.audit_logs to service_role;

create policy audit_logs_service_role_all
on public.audit_logs
for all
to service_role
using (true)
with check (true);

-- The admin demo-requests API route and the reject/revoke atomic RPC both read
-- and write demo_requests.demo_status, .linked_dealer_id and .demo_expires_at
-- to mirror the authoritative lifecycle state kept on dealer_demo_subscriptions,
-- but no migration ever added these columns to demo_requests: every write path
-- (activate_demo, reject, revoke_demo, convert_demo) fails with
-- "column demo_requests.demo_status does not exist" after the dealer side of
-- the lifecycle has already been mutated, leaving demo_requests stuck on its
-- previous status while a working dealer account silently exists.
alter table public.demo_requests
  add column if not exists demo_status text,
  add column if not exists linked_dealer_id uuid references public.dealers(id) on delete set null,
  add column if not exists demo_expires_at timestamptz;

create index if not exists demo_requests_linked_dealer_id_idx on public.demo_requests (linked_dealer_id);

commit;
