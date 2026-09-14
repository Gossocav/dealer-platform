-- Ritorno di 20260914060000_la_protezione_delle_attivita_entra_nei_file.sql.
--
-- **Quasi sempre non serve.** Quella migration non cambia niente in
-- produzione: ci mette cio' che c'e' gia', con l'impronta verificata. Se dopo
-- averla applicata qualcosa si rompesse, vorrebbe dire che il testo riletto
-- non era quello in vigore, e allora la cosa da fare non e' tornare indietro
-- alla cieca ma rileggere la funzione dalla produzione.
--
-- Questo file toglie la funzione e il suo trigger, riportando il database allo
-- stato di una ricostruzione da zero fatta prima del 14/09/2026 -- cioe' senza
-- nessuna protezione sulle attivita' dei contatti. **Non e' lo stato della
-- produzione di oggi**, che la protezione ce l'ha: eseguirlo sulla produzione
-- vorrebbe dire toglierla.

begin;

drop trigger if exists trg_enforce_lead_activity_dealer_id on public.lead_activities;
drop function if exists public.enforce_lead_activity_dealer_id();

commit;
