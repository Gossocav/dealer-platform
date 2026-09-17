-- Ritorno di 20260916010000_una_targa_attiva_per_concessionaria.sql.
--
-- Toglie l'indice. Nessun dato si perde: l'indice non ha cambiato nessuna
-- riga, ha solo impedito che ne nascessero due con la stessa targa attiva.

begin;

drop index if exists public.vehicles_una_targa_attiva_per_concessionaria;

commit;
