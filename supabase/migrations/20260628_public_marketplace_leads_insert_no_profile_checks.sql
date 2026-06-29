begin;

-- Ensure marketplace source is available and normalized.
alter table public.leads
  add column if not exists source text;

update public.leads
set source = 'marketplace'
where source is null;

alter table public.leads
  alter column source set default 'marketplace';

alter table public.leads
  alter column source set not null;

-- Public marketplace inserts must be possible for anonymous users.
grant insert on public.leads to anon;
grant insert on public.leads to authenticated;

-- Replace insert policies with a dedicated public marketplace policy.
drop policy if exists leads_insert_own on public.leads;
drop policy if exists leads_insert_marketplace_public on public.leads;

create policy leads_insert_marketplace_public
on public.leads
for insert
to anon, authenticated
with check (
  source = 'marketplace'
  and vehicle_id is not null
  and exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and (
        dealer_id is null
        or dealer_id is not distinct from v.dealer_id
      )
  )
);

-- Remove legacy leads triggers that still reference auth/profile checks.
do $$
declare
  r record;
begin
  for r in
    select t.tgname
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.leads'::regclass
      and not t.tgisinternal
      and (
        pg_get_functiondef(p.oid) ilike '%auth.uid()%'
        or pg_get_functiondef(p.oid) ilike '%public.profiles%'
        or pg_get_functiondef(p.oid) ilike '%Utente autenticato senza dealer associato in profiles.%'
      )
  loop
    execute format('drop trigger if exists %I on public.leads', r.tgname);
  end loop;
end;
$$;

-- Override any legacy trigger logic that depended on auth/profile lookups.
-- For marketplace leads:
-- - do not read auth.uid()
-- - do not read profiles
-- - allow dealer_id null, or require consistency when provided.
create or replace function public.enforce_lead_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_dealer_id uuid;
begin
  if tg_op = 'INSERT' and coalesce(new.source, 'marketplace') = 'marketplace' then
    if new.vehicle_id is null then
      raise exception 'vehicle_id obbligatorio per lead marketplace.' using errcode = '23502';
    end if;

    select v.dealer_id
    into v_vehicle_dealer_id
    from public.vehicles v
    where v.id = new.vehicle_id
    limit 1;

    if not found then
      raise exception 'Veicolo non trovato o non accessibile.' using errcode = '42501';
    end if;

    if new.dealer_id is not null and new.dealer_id is distinct from v_vehicle_dealer_id then
      raise exception 'dealer_id non consentito per questo veicolo.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.dealer_id is distinct from old.dealer_id then
      raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_lead_dealer_id on public.leads;
create trigger trg_enforce_lead_dealer_id
before insert or update on public.leads
for each row
execute function public.enforce_lead_dealer_id();

commit;
