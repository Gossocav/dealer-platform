-- Ritorno di 20260918010000_la_provenienza_delle_auto_sparite_dal_sito.sql.
--
-- Rimette a vuoto `origine_dati` **solo** sulle schede che questa migration
-- ha scritto, riconosciute dalla forma: sparite dal sito, e con ogni segno
-- uguale a `{"fonte": "sito", "confermato_il": null}`.
--
-- La condizione sulla forma non e' prudenza per abitudine: se un giorno una
-- di quelle schede tornasse sul sito e venisse riletta, i suoi segni
-- cambierebbero (una conferma, un disaccordo, una fonte diversa) e quella
-- riga **non** verrebbe toccata da qui. Un ritorno che cancella anche cio'
-- che non ha scritto e' peggio del difetto che voleva annullare.
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
   and not exists (
     select 1
       from jsonb_each(v.origine_dati) as s(campo, segno)
      where s.segno <> jsonb_build_object('fonte', 'sito', 'confermato_il', null)
   );

commit;
