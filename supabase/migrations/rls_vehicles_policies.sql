-- RLS policy pack for public.vehicles + public.vehicle_images
-- Safe to run in Supabase SQL Editor.
-- Idempotent: can be executed multiple times.

begin;

-- =============================
-- 1) Diagnostics (current state)
-- =============================
-- RLS enabled/forced on target tables
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('vehicles', 'vehicle_images')
order by c.relname;

-- Existing policies on target tables
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('vehicles', 'vehicle_images')
order by tablename, policyname;

-- =========================================
-- 2) Helper function: authenticated dealer id
-- =========================================
create or replace function public.current_dealer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.dealer_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

revoke all on function public.current_dealer_id() from public;
grant execute on function public.current_dealer_id() to authenticated;

-- ====================================================
-- 3) Trigger to enforce/fill dealer_id on insert/update
-- ====================================================
create or replace function public.enforce_vehicle_dealer_id()
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

  if tg_op = 'UPDATE' then
    if new.dealer_id is distinct from old.dealer_id then
      raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_vehicle_dealer_id on public.vehicles;
create trigger trg_enforce_vehicle_dealer_id
before insert or update on public.vehicles
for each row
execute function public.enforce_vehicle_dealer_id();

create or replace function public.enforce_vehicle_image_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
  v_owner_dealer uuid;
begin
  v_dealer_id := public.current_dealer_id();

  if new.vehicle_id is null then
    raise exception 'vehicle_id e obbligatorio.' using errcode = '23502';
  end if;

  select v.dealer_id
  into v_owner_dealer
  from public.vehicles v
  where v.id = new.vehicle_id
  limit 1;

  if v_owner_dealer is null then
    raise exception 'Veicolo non trovato o non accessibile.' using errcode = '42501';
  end if;

  if v_owner_dealer <> v_dealer_id then
    raise exception 'vehicle_id non appartiene al dealer autenticato.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.dealer_id is null then
      new.dealer_id := v_dealer_id;
    elsif new.dealer_id <> v_dealer_id then
      raise exception 'dealer_id non consentito per questo utente.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.dealer_id is distinct from old.dealer_id then
      raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_vehicle_image_dealer_id on public.vehicle_images;
create trigger trg_enforce_vehicle_image_dealer_id
before insert or update on public.vehicle_images
for each row
execute function public.enforce_vehicle_image_dealer_id();

-- =========================
-- 4) Keep RLS enabled/forced
-- =========================
alter table public.vehicles enable row level security;
alter table public.vehicles force row level security;
alter table public.vehicle_images enable row level security;
alter table public.vehicle_images force row level security;

-- ==========================
-- 5) Replace vehicles policies
-- ==========================
drop policy if exists vehicles_select_own on public.vehicles;
drop policy if exists vehicles_insert_own on public.vehicles;
drop policy if exists vehicles_update_own on public.vehicles;
drop policy if exists vehicles_delete_own on public.vehicles;

create policy vehicles_select_own
on public.vehicles
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy vehicles_insert_own
on public.vehicles
for insert
to authenticated
with check (
  coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id()
);

create policy vehicles_update_own
on public.vehicles
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy vehicles_delete_own
on public.vehicles
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

drop policy if exists vehicle_images_select_own on public.vehicle_images;
drop policy if exists vehicle_images_insert_own on public.vehicle_images;
drop policy if exists vehicle_images_update_own on public.vehicle_images;
drop policy if exists vehicle_images_delete_own on public.vehicle_images;

create policy vehicle_images_select_own
on public.vehicle_images
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = public.current_dealer_id()
  )
);

create policy vehicle_images_insert_own
on public.vehicle_images
for insert
to authenticated
with check (
  coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id()
  and exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = public.current_dealer_id()
  )
);

create policy vehicle_images_update_own
on public.vehicle_images
for update
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = public.current_dealer_id()
  )
)
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = public.current_dealer_id()
  )
);

create policy vehicle_images_delete_own
on public.vehicle_images
for delete
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = public.current_dealer_id()
  )
);

-- =====================================
-- 6) Privileges (required with RLS)
-- =====================================
grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.vehicle_images to authenticated;

commit;

-- =============================
-- Optional post-check after run
-- =============================
-- select
--   n.nspname as schema_name,
--   c.relname as table_name,
--   c.relrowsecurity as rls_enabled,
--   c.relforcerowsecurity as rls_forced
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname in ('vehicles', 'vehicle_images')
-- order by c.relname;
--
-- select
--   schemaname,
--   tablename,
--   policyname,
--   cmd,
--   roles,
--   qual,
--   with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('vehicles', 'vehicle_images')
-- order by tablename, policyname;
