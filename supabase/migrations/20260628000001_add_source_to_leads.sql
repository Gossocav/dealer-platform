begin;

alter table public.leads
  add column if not exists source text;

update public.leads
set source = 'marketplace'
where source is null;

alter table public.leads
  alter column source set default 'marketplace';

alter table public.leads
  alter column source set not null;

commit;
