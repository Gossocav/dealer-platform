-- Ritorno di 20260914080000_le_ultime_colonne_come_in_produzione.sql.
--
-- Rimette le quindici colonne come ammette-il-vuoto, riporta `actor_type` a
-- testo libero e ricrea `vehicle_images.updated_at`.
--
-- **Il tipo enumerato non si cancella**: se ci fosse un'altra colonna che lo
-- usa, cancellarlo la romperebbe. Resta li', inerte, e non da' fastidio a
-- nessuno.
--
-- Le quattro chiavi di concessionaria non sono qui: il loro ritorno e'
-- 20260914050000_ritorno.sql, e sono due decisioni separate.

begin;

alter table public.appointments   alter column created_at   drop not null;
alter table public.appointments   alter column updated_at   drop not null;
alter table public.customers      alter column created_at   drop not null;
alter table public.customers      alter column updated_at   drop not null;
alter table public.demo_requests  alter column city         drop not null;
alter table public.demo_requests  alter column company_name drop not null;
alter table public.demo_requests  alter column phone        drop not null;
alter table public.leads          alter column created_at   drop not null;
alter table public.profiles       alter column created_at   drop not null;
alter table public.profiles       alter column updated_at   drop not null;
alter table public.vehicle_images alter column created_at   drop not null;
alter table public.vehicle_images alter column is_cover     drop not null;
alter table public.vehicles       alter column created_at   drop not null;
alter table public.vehicles       alter column published    drop not null;
alter table public.vehicles       alter column updated_at   drop not null;

alter table public.audit_logs alter column actor_type type text using actor_type::text;

alter table public.vehicle_images add column if not exists updated_at timestamptz not null default now();

commit;
