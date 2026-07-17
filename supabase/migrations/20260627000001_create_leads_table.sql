begin;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  message text,
  status text not null default 'created' check (status in ('created', 'contacted', 'appointment', 'negotiation', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads enable row level security;
alter table public.leads force row level security;

drop policy if exists leads_select_own on public.leads;
drop policy if exists leads_insert_own on public.leads;
drop policy if exists leads_update_own on public.leads;
drop policy if exists leads_delete_own on public.leads;

create policy leads_select_own
on public.leads
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy leads_insert_own
on public.leads
for insert
to anon, authenticated
with check (
  dealer_id is not null
  and exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = dealer_id
  )
);

create policy leads_update_own
on public.leads
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy leads_delete_own
on public.leads
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

create or replace function public.enforce_lead_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_dealer_id uuid;
begin
  select v.dealer_id
  into v_vehicle_dealer_id
  from public.vehicles v
  where v.id = new.vehicle_id
  limit 1;

  if v_vehicle_dealer_id is null then
    raise exception 'Veicolo non trovato o non accessibile.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.dealer_id is null then
      new.dealer_id := v_vehicle_dealer_id;
    elsif new.dealer_id <> v_vehicle_dealer_id then
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
