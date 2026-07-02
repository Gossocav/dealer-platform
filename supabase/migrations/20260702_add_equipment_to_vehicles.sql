begin;

alter table public.vehicles
  add column if not exists equipment text[] default '{}';

commit;
