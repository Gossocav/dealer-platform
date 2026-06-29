begin;

alter table public.leads
  add column if not exists status text,
  add column if not exists updated_at timestamptz default now();

update public.leads
set status = case lower(coalesce(status, ''))
  when 'created' then 'nuovo'
  when 'contacted' then 'contattato'
  when 'appointment' then 'trattativa'
  when 'negotiation' then 'trattativa'
  when 'won' then 'venduto'
  when 'lost' then 'perso'
  when 'nuovo' then 'nuovo'
  when 'contattato' then 'contattato'
  when 'trattativa' then 'trattativa'
  when 'venduto' then 'venduto'
  when 'perso' then 'perso'
  else 'nuovo'
end;

update public.leads
set updated_at = now()
where updated_at is null;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'leads'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.leads drop constraint if exists %I', r.conname);
  end loop;
end;
$$;

alter table public.leads
  alter column status set default 'nuovo',
  alter column status set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.leads
  add constraint leads_status_check
  check (status in ('nuovo', 'contattato', 'trattativa', 'venduto', 'perso'));

commit;
