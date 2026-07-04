begin;

alter table public.vehicles
add column if not exists traction text;

commit;
