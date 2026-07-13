begin;

alter table public.demo_requests enable row level security;
alter table public.demo_requests force row level security;

drop policy if exists demo_requests_insert_public on public.demo_requests;
drop policy if exists demo_requests_service_role_all on public.demo_requests;
drop policy if exists demo_requests_select_admin on public.demo_requests;
drop policy if exists demo_requests_update_admin on public.demo_requests;
drop policy if exists demo_requests_delete_admin on public.demo_requests;

revoke all on table public.demo_requests from anon;
revoke all on table public.demo_requests from authenticated;

grant insert on table public.demo_requests to anon;
grant select, insert, update, delete on table public.demo_requests to service_role;

create policy demo_requests_insert_public
on public.demo_requests
for insert
to anon
with check (
  status = 'pending'
  and btrim(dealership_name) <> ''
  and btrim(company_name) <> ''
  and btrim(contact_name) <> ''
  and btrim(email) <> ''
  and btrim(phone) <> ''
  and btrim(city) <> ''
  and btrim(vehicle_count) <> ''
);

create policy demo_requests_service_role_all
on public.demo_requests
for all
to service_role
using (true)
with check (true);

commit;
