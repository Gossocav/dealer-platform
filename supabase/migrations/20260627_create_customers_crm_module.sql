begin;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  first_name text,
  last_name text,
  company text,
  vat_number text,
  tax_code text,
  email text,
  phone text,
  mobile text,
  address text,
  city text,
  province text,
  zip_code text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers add column if not exists dealer_id uuid references public.dealers(id) on delete cascade;
alter table public.customers add column if not exists first_name text;
alter table public.customers add column if not exists last_name text;
alter table public.customers add column if not exists company text;
alter table public.customers add column if not exists vat_number text;
alter table public.customers add column if not exists tax_code text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists mobile text;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists city text;
alter table public.customers add column if not exists province text;
alter table public.customers add column if not exists zip_code text;
alter table public.customers add column if not exists notes text;
alter table public.customers add column if not exists created_at timestamptz default now();
alter table public.customers add column if not exists updated_at timestamptz default now();

create index if not exists customers_dealer_id_idx on public.customers (dealer_id);
create index if not exists customers_email_idx on public.customers (email);
create index if not exists customers_phone_idx on public.customers (phone);

alter table public.customers enable row level security;
alter table public.customers force row level security;

drop policy if exists customers_select_own on public.customers;
drop policy if exists customers_insert_own on public.customers;
drop policy if exists customers_update_own on public.customers;
drop policy if exists customers_delete_own on public.customers;

create policy customers_select_own
on public.customers
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy customers_insert_own
on public.customers
for insert
to authenticated
with check (
  coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id()
);

create policy customers_update_own
on public.customers
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy customers_delete_own
on public.customers
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

create or replace function public.enforce_customer_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
begin
  v_dealer_id := public.current_dealer_id();

  if tg_op = 'INSERT' then
    if new.dealer_id is null then
      new.dealer_id := v_dealer_id;
    elsif new.dealer_id <> v_dealer_id then
      raise exception 'dealer_id non consentito per questo utente.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.dealer_id is distinct from old.dealer_id then
    raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_customer_dealer_id on public.customers;
create trigger trg_enforce_customer_dealer_id
before insert or update on public.customers
for each row
execute function public.enforce_customer_dealer_id();

alter table public.leads add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists leads_customer_id_idx on public.leads (customer_id);

alter table public.vehicles add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists vehicles_customer_id_idx on public.vehicles (customer_id);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  title text,
  appointment_type text,
  appointment_date timestamptz,
  status text default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments add column if not exists dealer_id uuid references public.dealers(id) on delete cascade;
alter table public.appointments add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.appointments add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
alter table public.appointments add column if not exists title text;
alter table public.appointments add column if not exists appointment_type text;
alter table public.appointments add column if not exists appointment_date timestamptz;
alter table public.appointments add column if not exists status text default 'scheduled';
alter table public.appointments add column if not exists notes text;
alter table public.appointments add column if not exists created_at timestamptz default now();
alter table public.appointments add column if not exists updated_at timestamptz default now();

create index if not exists appointments_dealer_id_idx on public.appointments (dealer_id);
create index if not exists appointments_customer_id_idx on public.appointments (customer_id);
create index if not exists appointments_vehicle_id_idx on public.appointments (vehicle_id);

alter table public.appointments enable row level security;
alter table public.appointments force row level security;

drop policy if exists appointments_select_own on public.appointments;
drop policy if exists appointments_insert_own on public.appointments;
drop policy if exists appointments_update_own on public.appointments;
drop policy if exists appointments_delete_own on public.appointments;

create policy appointments_select_own
on public.appointments
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy appointments_insert_own
on public.appointments
for insert
to authenticated
with check (
  coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id()
);

create policy appointments_update_own
on public.appointments
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy appointments_delete_own
on public.appointments
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

create or replace function public.enforce_appointment_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
  v_customer_dealer uuid;
  v_vehicle_dealer uuid;
begin
  v_dealer_id := public.current_dealer_id();

  if tg_op = 'INSERT' then
    if new.dealer_id is null then
      new.dealer_id := v_dealer_id;
    elsif new.dealer_id <> v_dealer_id then
      raise exception 'dealer_id non consentito per questo utente.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.dealer_id is distinct from old.dealer_id then
    raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
  end if;

  if new.customer_id is not null then
    select c.dealer_id into v_customer_dealer
    from public.customers c
    where c.id = new.customer_id
    limit 1;

    if v_customer_dealer is null or v_customer_dealer <> new.dealer_id then
      raise exception 'customer_id non appartiene al dealer autenticato.' using errcode = '42501';
    end if;
  end if;

  if new.vehicle_id is not null then
    select v.dealer_id into v_vehicle_dealer
    from public.vehicles v
    where v.id = new.vehicle_id
    limit 1;

    if v_vehicle_dealer is null or v_vehicle_dealer <> new.dealer_id then
      raise exception 'vehicle_id non appartiene al dealer autenticato.' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_appointment_dealer_id on public.appointments;
create trigger trg_enforce_appointment_dealer_id
before insert or update on public.appointments
for each row
execute function public.enforce_appointment_dealer_id();

create or replace function public.enforce_customer_relation_dealer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_dealer uuid;
begin
  if new.customer_id is null then
    return new;
  end if;

  select c.dealer_id into v_customer_dealer
  from public.customers c
  where c.id = new.customer_id
  limit 1;

  if v_customer_dealer is null then
    raise exception 'Cliente non trovato.' using errcode = '42501';
  end if;

  if new.dealer_id is null then
    new.dealer_id := v_customer_dealer;
  elsif new.dealer_id <> v_customer_dealer then
    raise exception 'customer_id non appartiene al dealer del record.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_lead_customer_relation on public.leads;
create trigger trg_enforce_lead_customer_relation
before insert or update on public.leads
for each row
execute function public.enforce_customer_relation_dealer();

drop trigger if exists trg_enforce_vehicle_customer_relation on public.vehicles;
create trigger trg_enforce_vehicle_customer_relation
before insert or update on public.vehicles
for each row
execute function public.enforce_customer_relation_dealer();

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;

commit;
