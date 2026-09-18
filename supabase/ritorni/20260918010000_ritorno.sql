-- Ritorno di 20260918010000_la_provenienza_delle_auto_sparite_dal_sito.sql.
--
-- Rimette a vuoto `origine_dati` **solo** sulle schede che questa migration ha
-- scritto. Riconoscerle non e' banale, e la prima versione di questo file
-- sbagliava: cercava le schede sparite dal sito con ogni segno uguale a
-- `{"fonte": "sito", "confermato_il": null}`, ma quella forma e' **identica** a
-- quella di una scheda che il ripasso aveva segnato mentre era ancora sul sito
-- e che e' sparita il giorno dopo. In produzione ce ne sono due, e una delle
-- due sarebbe stata cancellata da un ritorno che prometteva di non toccarla.
--
-- Il segno che le distingue e' `vehicle_category`: il ripasso lo scrive sempre
-- (passa da `payloadDatiVeicolo`), questa migration **mai** -- di proposito,
-- perche' quel campo dal sito non arriva. Verificato sulle due schede vere: ce
-- l'hanno tutte e due.
--
-- **Questo ritorno si usa subito, non fra mesi.** Il giorno in cui si
-- correggera' l'imprecisione del ripasso su `vehicle_category` -- ed e' da
-- correggere -- questa distinzione smettera' di valere. Chi si trovasse qui
-- dopo quella correzione deve riconoscere le schede in un altro modo, non
-- eseguire questo file e sperare.
--
-- Nessun dato del veicolo si perde: si cancella soltanto la registrazione di
-- **da dove** arrivava, e le schede tornano a dire "provenienza non
-- registrata" come prima.

begin;

update public.vehicles v
   set origine_dati = '{}'::jsonb
 where v.import_source is not null
   and v.import_missing_since is not null
   and v.origine_dati <> '{}'::jsonb
   -- Segnata dal ripasso, non da qui: non si tocca.
   and not (v.origine_dati ? 'vehicle_category')
   -- E ogni segno deve avere esattamente la forma che questa migration
   -- scrive: nessuna conferma, nessun disaccordo, nessuna fonte diversa.
   and not exists (
     select 1
       from jsonb_each(v.origine_dati) as s(campo, segno)
      where s.segno <> jsonb_build_object('fonte', 'sito', 'confermato_il', null)
   );

commit;

-- Come per la migration, l'ultima istruzione e' il conto: senza, l'editor SQL
-- direbbe soltanto "Success. No rows returned" e non si saprebbe quante
-- schede sono tornate indietro.
select
  count(*) filter (
    where v.origine_dati <> '{}'::jsonb and not (v.origine_dati ? 'vehicle_category')
  ) as schede_ancora_segnate_da_quella_migration,
  count(*) filter (where v.origine_dati = '{}'::jsonb) as schede_senza_provenienza,
  count(*) filter (where v.origine_dati ? 'vehicle_category') as segnate_dal_ripasso_intatte
from public.vehicles v
where v.import_source is not null
  and v.import_missing_since is not null;
