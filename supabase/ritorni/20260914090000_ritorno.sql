-- Ritorno di 20260914090000_gli_otto_indici_che_mancano.sql.
--
-- Toglie gli otto indici. Nessun dato viene toccato: un indice si ricostruisce
-- dai dati che ci sono gia'.
--
-- Serve solo se uno di questi indici facesse rallentare una scrittura invece
-- di velocizzare una lettura -- possibile su tabelle che si scrivono molto
-- piu' di quanto si leggano, che qui non e' il caso di nessuna.

begin;

drop index if exists public.vehicles_dealer_id_idx;
drop index if exists public.vehicles_published_idx;
drop index if exists public.vehicles_status_idx;
drop index if exists public.vehicle_images_vehicle_id_idx;
drop index if exists public.vehicle_images_cover_idx;
drop index if exists public.vehicle_images_dealer_id_idx;
drop index if exists public.idx_demo_requests_status;
drop index if exists public.idx_demo_requests_created_at;

commit;
