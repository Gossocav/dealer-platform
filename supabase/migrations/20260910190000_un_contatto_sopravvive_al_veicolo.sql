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
-- `leads.customer_id` resta com'e': in produzione la chiave e' senza azione
-- (cancellare un cliente con contatti collegati da' errore), nei file era
-- SET NULL. Quale dei due sia giusto lo decide il titolare; nel frattempo
-- nessun codice scrive quella colonna.

begin;

alter table public.leads
  alter column vehicle_id drop not null;

alter table public.leads
  drop constraint if exists leads_vehicle_id_fkey;

alter table public.leads
  add constraint leads_vehicle_id_fkey
  foreign key (vehicle_id) references public.vehicles(id) on delete set null;

commit;
