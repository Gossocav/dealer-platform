-- Ritorno di 20260914050000_le_chiavi_di_concessionaria_sono_obbligatorie.sql.
--
-- Toglie l'obbligatorieta' dalle quattro chiavi, riportandole com'erano il
-- 14/09/2026.
--
-- **La riga di prova cancellata non si rimette.** Era un detrito delle prove
-- di isolamento del 22/08/2026 -- "PROVA-SENZA-RETURN", `p3@example.invalid`,
-- nessun contatto collegato -- e ricrearla vorrebbe dire rimettere in archivio
-- un cliente che non esiste e che nessuno puo' vedere ne' cancellare. Se
-- servisse davvero, il testo per ricrearla e' qui sotto, commentato.

begin;

alter table public.vehicles       alter column dealer_id  drop not null;
alter table public.appointments   alter column dealer_id  drop not null;
alter table public.customers      alter column dealer_id  drop not null;
alter table public.vehicle_images alter column vehicle_id drop not null;

-- insert into public.customers (id, dealer_id, first_name, email, customer_type, created_at, updated_at)
-- values ('0ca91b18-304b-4545-9feb-d8cef0a639b7', null, 'PROVA-SENZA-RETURN',
--         'p3@example.invalid', 'private', '2026-08-22T16:07:20.901917+00:00',
--         '2026-08-22T16:07:20.901917+00:00');

commit;
