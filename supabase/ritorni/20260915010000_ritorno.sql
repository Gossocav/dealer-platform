-- Ritorno di 20260915010000_da_dove_viene_ogni_dato.sql.
--
-- Toglie la colonna e il suo vincolo.
--
-- **Attenzione: si perde l'informazione, non si mette da parte.** Tolta la
-- colonna, di ogni dato letto dal sito non si sa piu' se il concessionario
-- l'ha confermato. Rimetterla dopo non lo recupera: bisognerebbe richiedere
-- tutte le conferme da capo.
--
-- Si torna qui solo prima che la sincronizzazione abbia scritto qualcosa.

begin;

alter table public.vehicles drop constraint if exists vehicles_origine_dati_e_un_oggetto;
alter table public.vehicles drop column if exists origine_dati;

commit;
