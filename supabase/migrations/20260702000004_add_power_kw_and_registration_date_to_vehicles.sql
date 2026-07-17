begin;

alter table public.vehicles
  add column if not exists power_kw integer,
  add column if not exists registration_date text;

commit;
