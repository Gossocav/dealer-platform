begin;

alter table public.appointments
  drop constraint if exists appointments_status_valid;

update public.appointments
set status = case lower(coalesce(status, ''))
  when 'scheduled' then 'programmato'
  when 'confirmed' then 'programmato'
  when 'completed' then 'completato'
  when 'cancelled' then 'annullato'
  when 'programmato' then 'programmato'
  when 'completato' then 'completato'
  when 'annullato' then 'annullato'
  else 'programmato'
end;

alter table public.appointments
  alter column status set default 'programmato';

alter table public.appointments
  add constraint appointments_status_valid
  check (status in ('programmato', 'completato', 'annullato'));

create index if not exists appointments_dealer_lead_start_desc_idx
on public.appointments (dealer_id, lead_id, start_at desc);

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
  and (lead_id is null or exists (
    select 1
    from public.leads l
    where l.id = lead_id
      and l.dealer_id = public.current_dealer_id()
  ))
  and (vehicle_id is null or exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = public.current_dealer_id()
  ))
);

create policy appointments_update_own
on public.appointments
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (
  dealer_id = public.current_dealer_id()
  and (lead_id is null or exists (
    select 1
    from public.leads l
    where l.id = lead_id
      and l.dealer_id = public.current_dealer_id()
  ))
  and (vehicle_id is null or exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = public.current_dealer_id()
  ))
);

create policy appointments_delete_own
on public.appointments
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

grant select, insert, update, delete on public.appointments to authenticated;

commit;
