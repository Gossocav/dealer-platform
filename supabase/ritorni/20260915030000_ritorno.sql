-- Ritorno di 20260915030000_da_dove_arriva_una_vettura.sql.
--
-- Toglie la tabella, il suo trigger e la sua funzione.
--
-- **Si perdono le date d'ingresso e le provenienze**, comprese quelle che il
-- concessionario ha confermato a mano. Quelle lette dal sito si riprendono con
-- una sincronizzazione; quelle scritte da lui **no**.
--
-- Si torna qui solo prima che il concessionario abbia cominciato a
-- confermarle.

begin;

drop trigger if exists trg_enforce_vehicle_acquisition_dealer_id on public.vehicle_acquisitions;
drop table if exists public.vehicle_acquisitions;
drop function if exists public.enforce_vehicle_acquisition_dealer_id();

commit;
