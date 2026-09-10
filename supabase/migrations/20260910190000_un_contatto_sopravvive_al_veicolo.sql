-- ============================================================
-- Un contatto sopravvive al veicolo che lo ha generato
-- ============================================================
--
-- Nei file `leads.vehicle_id` era obbligatorio e la chiave esterna verso
-- `vehicles` era ON DELETE CASCADE: cancellando un'auto dal gestionale
-- sparivano anche i contatti dei clienti che l'avevano chiesta. Misurato su
-- Postgres vero il 10/09/2026: un veicolo cancellato dal browser, contatto
-- "ancora presente: 0".
--
-- La produzione fa la cosa giusta -- la colonna ammette il vuoto e la chiave
-- e' ON DELETE SET NULL: l'auto se ne va, il cliente resta con il campo
-- veicolo vuoto -- e i file si allineano a lei. Applicata in produzione,
-- questa parte non cambia niente.
--
-- Per `customers` e' il contrario: in produzione la chiave e' senza azione,
-- quindi cancellare un cliente che ha contatti collegati fallisce con un
-- errore; nei file era gia' SET NULL. Qui vince il file: il cliente si
-- cancella e i suoi contatti restano, senza anagrafica collegata. Applicata
-- in produzione, questa parte cambia quel comportamento.

begin;

alter table public.leads
  alter column vehicle_id drop not null;

alter table public.leads
  drop constraint if exists leads_vehicle_id_fkey;

alter table public.leads
  add constraint leads_vehicle_id_fkey
  foreign key (vehicle_id) references public.vehicles(id) on delete set null;

alter table public.leads
  drop constraint if exists leads_customer_id_fkey;

alter table public.leads
  add constraint leads_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

commit;
