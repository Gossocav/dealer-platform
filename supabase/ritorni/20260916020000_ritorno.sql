-- Ritorno di 20260916020000_un_telaio_attivo_per_concessionaria.sql.
--
-- Toglie l'indice. Nessun dato si perde.

begin;

drop index if exists public.vehicles_un_telaio_attivo_per_concessionaria;

commit;
