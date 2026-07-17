begin;

alter table public.appointments
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists description text,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz;

-- Backfill from legacy columns used by early pages.
update public.appointments
set start_at = coalesce(start_at, appointment_date)
where start_at is null and appointment_date is not null;

update public.appointments
set description = coalesce(description, notes)
where description is null and notes is not null;

update public.appointments
set title = coalesce(title, appointment_type, 'Appuntamento')
where title is null;

update public.appointments
set status = case
  when lower(coalesce(status, '')) in ('scheduled', 'confirmed', 'completed', 'cancelled') then lower(status)
  when lower(coalesce(status, '')) in ('programmato', 'da svolgere', 'in programma') then 'scheduled'
  when lower(coalesce(status, '')) in ('confermato') then 'confirmed'
  when lower(coalesce(status, '')) in ('concluso', 'fatto', 'terminato') then 'completed'
  when lower(coalesce(status, '')) in ('annullato', 'cancellato') then 'cancelled'
  else 'scheduled'
end;

alter table public.appointments
  alter column status set default 'scheduled';

alter table public.appointments
  drop constraint if exists appointments_status_valid;

alter table public.appointments
  add constraint appointments_status_valid
  check (status in ('scheduled', 'confirmed', 'completed', 'cancelled'));

create index if not exists appointments_lead_id_idx on public.appointments (lead_id);
create index if not exists appointments_start_at_idx on public.appointments (start_at);
create index if not exists appointments_status_idx on public.appointments (status);

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
  v_lead_dealer uuid;
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

  if new.lead_id is not null then
    select l.dealer_id into v_lead_dealer
    from public.leads l
    where l.id = new.lead_id
    limit 1;

    if v_lead_dealer is null or v_lead_dealer <> new.dealer_id then
      raise exception 'lead_id non appartiene al dealer autenticato.' using errcode = '42501';
    end if;
  end if;

  if new.end_at is not null and new.start_at is not null and new.end_at < new.start_at then
    raise exception 'end_at non puo essere precedente a start_at.' using errcode = '22007';
  end if;

  if new.start_at is null then
    new.start_at := coalesce(new.appointment_date, now());
  end if;

  if new.end_at is null then
    new.end_at := new.start_at + interval '1 hour';
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
with check (coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id());

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

grant select, insert, update, delete on public.appointments to authenticated;

commit;
