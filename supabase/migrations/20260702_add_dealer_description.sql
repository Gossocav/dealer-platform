begin;

alter table public.dealers
  add column if not exists description text;

commit;
