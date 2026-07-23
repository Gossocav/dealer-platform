-- New required-going-forward field: a mobile number ("Cellulare"), separate
-- from the existing landline "phone" ("Telefono fisso"). Nullable at the
-- schema level so past demo requests are not broken; enforced as required
-- for new submissions both in the app layer (src/app/demo/page.tsx,
-- src/app/api/demo/request/route.ts) and here, matching the same enforcement
-- already used for the other mandatory contact fields.

alter table public.demo_requests
  add column if not exists mobile_phone text;

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
  and btrim(mobile_phone) <> ''
  and btrim(city) <> ''
  and vehicle_count is not null
);
