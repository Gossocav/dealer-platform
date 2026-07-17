begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null check (type in ('lead_new', 'vehicle_new', 'lead_stale', 'vehicle_draft_stale')),
  read boolean not null default false,
  source_type text,
  source_id uuid,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (dealer_id = public.current_dealer_id() and user_id = auth.uid());

create policy notifications_update_own
on public.notifications
for update
to authenticated
using (dealer_id = public.current_dealer_id() and user_id = auth.uid())
with check (dealer_id = public.current_dealer_id() and user_id = auth.uid());

create policy notifications_delete_own
on public.notifications
for delete
to authenticated
using (dealer_id = public.current_dealer_id() and user_id = auth.uid());

create unique index if not exists notifications_unique_source_idx
on public.notifications (dealer_id, user_id, type, source_type, source_id);

create index if not exists notifications_unread_idx
on public.notifications (dealer_id, user_id, read, created_at desc);

create or replace function public.notify_dealer_users(
  p_dealer_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_source_type text,
  p_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id)
  select
    p_dealer_id,
    p.id,
    p_title,
    p_message,
    p_type,
    false,
    p_source_type,
    p_source_id
  from public.profiles p
  where p.dealer_id = p_dealer_id
  on conflict (dealer_id, user_id, type, source_type, source_id) do nothing;
end;
$$;

create or replace function public.create_notification_for_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_label text;
begin
  select trim(concat_ws(' ', v.brand, v.model, v.version))
  into v_vehicle_label
  from public.vehicles v
  where v.id = new.vehicle_id;

  perform public.notify_dealer_users(
    new.dealer_id,
    'lead_new',
    'Nuovo Lead',
    coalesce(v_vehicle_label, 'Veicolo non specificato') || ' - ' || coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''),
    'lead',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_create_notification_for_new_lead on public.leads;
create trigger trg_create_notification_for_new_lead
after insert on public.leads
for each row
execute function public.create_notification_for_new_lead();

create or replace function public.create_notification_for_new_vehicle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_label text;
begin
  v_vehicle_label := trim(concat_ws(' ', new.brand, new.model, new.version));

  perform public.notify_dealer_users(
    new.dealer_id,
    'vehicle_new',
    'Nuovo Veicolo',
    coalesce(v_vehicle_label, 'Veicolo') || ' appena inserito nel parco auto.',
    'vehicle',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_create_notification_for_new_vehicle on public.vehicles;
create trigger trg_create_notification_for_new_vehicle
after insert on public.vehicles
for each row
execute function public.create_notification_for_new_vehicle();

create or replace function public.sync_stale_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid := public.current_dealer_id();
  v_inserted integer := 0;
  v_last_inserted integer := 0;
begin
  if v_dealer_id is null then
    return 0;
  end if;

  with dealer_users as (
    select p.id as user_id
    from public.profiles p
    where p.dealer_id = v_dealer_id
  ),
  stale_leads as (
    select l.id, l.first_name, l.last_name, l.vehicle_id
    from public.leads l
    where l.dealer_id = v_dealer_id
      and coalesce(lower(l.status), 'created') = 'created'
      and l.created_at <= now() - interval '24 hours'
  )
  insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id)
  select
    v_dealer_id,
    du.user_id,
    'Lead non contattato da 24 ore',
    trim(concat_ws(' ', coalesce(sl.first_name, ''), coalesce(sl.last_name, ''))) ||
      case
        when sl.vehicle_id is null then ''
        else ' - lead ancora in attesa di contatto'
      end,
    'lead_stale',
    false,
    'lead',
    sl.id
  from stale_leads sl
  cross join dealer_users du
  on conflict (dealer_id, user_id, type, source_type, source_id) do nothing;

  get diagnostics v_inserted = row_count;

  with dealer_users as (
    select p.id as user_id
    from public.profiles p
    where p.dealer_id = v_dealer_id
  ),
  stale_vehicles as (
    select v.id, v.brand, v.model, v.version
    from public.vehicles v
    where v.dealer_id = v_dealer_id
      and coalesce(v.published, false) = false
      and coalesce(lower(v.status), 'draft') <> 'published'
      and v.created_at <= now() - interval '7 days'
  )
  insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id)
  select
    v_dealer_id,
    du.user_id,
    'Veicolo in bozza da oltre 7 giorni',
    trim(concat_ws(' ', sv.brand, sv.model, sv.version)) || ' non è ancora stato pubblicato.',
    'vehicle_draft_stale',
    false,
    'vehicle',
    sv.id
  from stale_vehicles sv
  cross join dealer_users du
  on conflict (dealer_id, user_id, type, source_type, source_id) do nothing;

  get diagnostics v_last_inserted = row_count;
  v_inserted := v_inserted + v_last_inserted;

  return v_inserted;
end;
$$;

grant select, update, delete on public.notifications to authenticated;
grant execute on function public.notify_dealer_users(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.sync_stale_notifications() to authenticated;

commit;