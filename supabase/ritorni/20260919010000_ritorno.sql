-- Ritorno di 20260919010000_i_numeri_della_vetrina_si_contano_nel_database.sql.
--
-- Toglie la vista. Nessun dato si perde: una vista non contiene niente, e'
-- solo un modo di guardare le automobili che ci sono gia'.
--
-- **Cosa succede alla pagina.** L'elenco delle concessionarie continua a
-- funzionare: se la vista non c'e', la pagina mostra le concessionarie
-- **senza i numeri** invece di mostrarne di sbagliati. E' la stessa scelta
-- che regge la finestra fra il momento in cui il codice va in linea e quello
-- in cui il titolare applica la migration.

begin;

drop view if exists public.vetrina_per_concessionaria;

commit;
