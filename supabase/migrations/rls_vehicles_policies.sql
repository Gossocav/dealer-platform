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
--
-- ATTENZIONE, e il motivo per cui questa parte e' stata riscritta il
-- 05/09/2026.
--
-- Questo file non ha la data davanti al nome. Ordinato per nome finisce
-- **ultimo**, dopo ogni migration 2026XXXX: su un database ricostruito da
-- zero -- un ambiente nuovo, un ripristino dopo un guasto -- e' l'ultima cosa
-- che gira, e quello che definisce qui vince su tutto.
--
-- Fino a oggi definiva `current_dealer_id()` cosi':
--
--     select p.dealer_id from public.profiles p where p.id = auth.uid() limit 1
--
-- cioe' la versione debole: legge il profilo e basta, senza guardare se
-- l'appartenenza alla concessionaria e' ancora **attiva**. Con quella
-- versione in vigore, sospendere una concessionaria non le toglie piu'
-- l'accesso, perche' il profilo continua a puntare al suo dealer_id. E
-- `current_dealer_id()` e' il fondamento di quasi ogni regola per riga del
-- progetto: vehicles, vehicle_images, leads, customers, appointments, le
-- tabelle email, il conto economico, le perizie, i documenti.
--
-- La migration 20260717000016 aveva gia' ripristinato la versione giusta e
-- annotato il pericolo, ma non poteva risolverlo: sorta prima di questo file,
-- e su una ricostruzione questo la sovrascriveva di nuovo. Il difetto non era
-- visibile in produzione -- li' la versione giusta c'e' -- e sarebbe uscito
-- solo il giorno peggiore, cioe' durante un ripristino.
--
-- Qui sotto c'e' ora la stessa identica definizione di 20260717000016. Un
-- test (src/lib/ricostruzione-database-sicura.test.ts) rilegge le migration
-- nell'ordine in cui verrebbero riapplicate e fallisce se l'ultima
-- definizione tornasse a essere quella debole.
create or replace function public.current_dealer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with active_memberships as (
    select distinct du.dealer_id
    from public.dealer_users du
    where du.profile_id = auth.uid()
      and du.status = 'active'
      and du.dealer_id is not null
  )
  select case
    when (select count(*) from active_memberships) = 1 then (select dealer_id from active_memberships limit 1)
    else null::uuid
  end
$$;

revoke all on function public.current_dealer_id() from public;
revoke all on function public.current_dealer_id() from anon;
grant execute on function public.current_dealer_id() to authenticated, service_role;

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

-- ==========================================================
-- 5) Le politiche di questo file non si ricreano piu'
-- ==========================================================
--
-- Qui c'erano otto `create policy` -- quattro su vehicles e quattro su
-- vehicle_images, con i nomi in inglese (`vehicles_select_own` e simili).
-- Adesso restano solo le cancellazioni, e le politiche buone sono quelle
-- che crea 20260822000000_isolamento_tenant_rls.sql con i nomi italiani.
--
-- **Perche'.** Questo file non ha una data nel nome, quindi in una
-- ricostruzione da zero -- ordinata per nome -- gira **per ultimo**, dopo la
-- migration di agosto. In produzione era andata al contrario: applicato a
-- suo tempo, poi il 22 agosto `pulisci_politiche` ha cancellato tutte le
-- politiche di vehicles e vehicle_images e le ha rifatte con i nomi nuovi.
--
-- Il risultato erano due mondi diversi, misurato il 09/09/2026 ricostruendo
-- lo schema su un Postgres vero e confrontandolo con la produzione:
--
--                        ricostruzione   produzione
--   vehicles                    9             5
--   vehicle_images              9             5
--
-- Le quattro di troppo per tabella erano queste, sopravvissute alla pulizia
-- di agosto perche' venivano ricreate dopo. Le regole per riga si sommano:
-- piu' politiche vuol dire piu' permessi, non meno. Non aprivano niente a
-- estranei -- si appoggiano tutte a `current_dealer_id()`, che dopo la
-- correzione di settembre e' la versione che controlla l'appartenenza
-- attiva -- ma erano otto regole fantasma che sarebbero comparse solo dopo
-- un ripristino, con nomi che non corrispondono a nessuna migration.
--
-- Le cancellazioni restano, e servono: su un database che ha ancora quelle
-- politiche (un ambiente vecchio) questo file le toglie e lascia in piedi
-- soltanto quelle di agosto.
--
-- **Non si e' rinominato il file** per dargli una data: il controllo di
-- deriva confronta i nomi dei file con le migration registrate in
-- produzione, e un rinomino gli farebbe vedere migration mancanti che
-- mancanti non sono. Si corregge il contenuto, come gia' fatto per
-- `current_dealer_id()`.
drop policy if exists vehicles_select_own on public.vehicles;
drop policy if exists vehicles_insert_own on public.vehicles;
drop policy if exists vehicles_update_own on public.vehicles;
drop policy if exists vehicles_delete_own on public.vehicles;

drop policy if exists vehicle_images_select_own on public.vehicle_images;
drop policy if exists vehicle_images_insert_own on public.vehicle_images;
drop policy if exists vehicle_images_update_own on public.vehicle_images;
drop policy if exists vehicle_images_delete_own on public.vehicle_images;

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
