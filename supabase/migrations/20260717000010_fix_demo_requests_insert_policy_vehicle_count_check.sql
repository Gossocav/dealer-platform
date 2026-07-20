begin;

-- 20260714000004_demo_requests_rls.sql's demo_requests_insert_public policy checked
-- btrim(vehicle_count) <> '', assuming vehicle_count is text (as originally defined in
-- 20260708000002_create_demo_requests.sql). Production's demo_requests.vehicle_count is
-- actually `integer` (changed outside the tracked migration history at some point), so
-- btrim(vehicle_count) fails to even parse the policy ("function btrim(integer) does not
-- exist"), which blocked the policy from ever being created and left demo_requests with
-- row-level security forced on and no policies at all -- no anon insert, no service_role
-- access. Replace the check with `vehicle_count is not null`, which is valid regardless
-- of whether the column is text or integer.
drop policy if exists demo_requests_insert_public on public.demo_requests;

create policy demo_requests_insert_public
on public.demo_requests
for insert
to anon
with check (
  status = 'pending'
  and btrim(dealership_name) <> ''
  and btrim(contact_name) <> ''
  and btrim(email) <> ''
  and btrim(phone) <> ''
  and btrim(city) <> ''
  and vehicle_count is not null
);

commit;
