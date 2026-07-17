begin;

alter table public.leads
  add column if not exists internal_notes text;

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

alter table public.leads disable trigger trg_enforce_lead_dealer_id;

update public.leads
set status = case lower(coalesce(status, ''))
  when 'created' then 'nuovo'
  when 'contacted' then 'contattato'
  when 'appointment' then 'appuntamento'
  when 'negotiation' then 'proposta_inviata'
  when 'quote' then 'proposta_inviata'
  when 'trattativa' then 'appuntamento'
  when 'preventivo' then 'proposta_inviata'
  when 'venduto' then 'chiuso_positivo'
  when 'won' then 'chiuso_positivo'
  when 'perso' then 'chiuso_negativo'
  when 'lost' then 'chiuso_negativo'
  when 'nuovo' then 'nuovo'
  when 'contattato' then 'contattato'
  when 'appuntamento' then 'appuntamento'
  when 'proposta_inviata' then 'proposta_inviata'
  when 'chiuso_positivo' then 'chiuso_positivo'
  when 'chiuso_negativo' then 'chiuso_negativo'
  else 'nuovo'
end;

alter table public.leads enable trigger trg_enforce_lead_dealer_id;

alter table public.leads
  alter column status set default 'nuovo',
  alter column status set not null;

alter table public.leads
  add constraint leads_status_check
  check (status in ('nuovo', 'contattato', 'appuntamento', 'proposta_inviata', 'chiuso_positivo', 'chiuso_negativo'));

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  activity_type text not null check (activity_type in ('lead_created', 'status_changed', 'note_added')),
  note text,
  metadata_json jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists lead_activities_dealer_lead_created_desc_idx
on public.lead_activities (dealer_id, lead_id, created_at desc);

alter table public.lead_activities enable row level security;
alter table public.lead_activities force row level security;

drop policy if exists lead_activities_select_own on public.lead_activities;
drop policy if exists lead_activities_insert_own on public.lead_activities;

create policy lead_activities_select_own
on public.lead_activities
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy lead_activities_insert_own
on public.lead_activities
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.leads l
    where l.id = lead_id
      and l.dealer_id = public.current_dealer_id()
  )
  and (created_by is null or created_by = auth.uid())
);

create or replace function public.enforce_lead_activity_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_dealer_id uuid;
  v_dealer_id uuid;
begin
  v_dealer_id := public.current_dealer_id();

  select l.dealer_id
  into v_lead_dealer_id
  from public.leads l
  where l.id = new.lead_id
  limit 1;

  if v_lead_dealer_id is null then
    raise exception 'Lead non trovato o non accessibile.' using errcode = '42501';
  end if;

  if v_lead_dealer_id <> v_dealer_id then
    raise exception 'lead_id non appartiene al dealer autenticato.' using errcode = '42501';
  end if;

  if new.dealer_id is null then
    new.dealer_id := v_lead_dealer_id;
  elsif new.dealer_id <> v_lead_dealer_id then
    raise exception 'dealer_id non consentito per questa attivita.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_lead_activity_dealer_id on public.lead_activities;
create trigger trg_enforce_lead_activity_dealer_id
before insert on public.lead_activities
for each row
execute function public.enforce_lead_activity_dealer_id();

grant select, insert on public.lead_activities to authenticated;

commit;
