begin;

alter table public.vehicles
  add column if not exists interior_type text;

commit;