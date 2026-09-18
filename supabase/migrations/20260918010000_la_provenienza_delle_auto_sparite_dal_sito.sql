-- La provenienza delle auto sparite dal sito, scritta una volta sola.
--
-- **Perche' serve.** Dal 15/09/2026 ogni scheda letta da un sito porta scritto
-- da dove viene ogni suo campo (`vehicles.origine_dati`), e dal 18/09 la
-- scheda del gestionale lo mostra. Ma quella scrittura la fa il **ripasso**,
-- e il ripasso salta le schede che hanno una data di sparizione
-- (`sincronizza-siti/route.ts`: `.is("import_missing_since", null)`) --
-- giustamente, perche' quelle pagine sul sito non ci sono piu' e non c'e'
-- niente da rileggere.
--
-- Il risultato, misurato in produzione il 18/09/2026: **58 schede su 372**
-- non hanno nessun segno, e sono tutte sparite dal sito. A schermo diranno
-- "provenienza non registrata" su ogni campo, **per sempre**: nessun giro
-- notturno le toccher/'a mai piu'. E sono proprio le schede che il
-- concessionario apre per chiedersi che fine ha fatto un'automobile.
--
-- **Questa non e' una rilettura: e' registrare quello che gia' sappiamo.**
-- Quelle righe le ha scritte l'importazione dal sito, e lo sappiamo con
-- certezza perche' hanno `import_source` valorizzato. Non si va a chiedere
-- niente a nessuno: si scrive il segno che il ripasso avrebbe scritto se
-- fosse potuto passare.
--
-- **Cosa scrive, campo per campo.** Solo i campi che l'importazione dal sito
-- scriveva **davvero** (`payloadDatiVeicolo` in `src/lib/dealer-site-sync.ts`),
-- e solo quelli che su quella riga **hanno un valore**: `scriviDalSito` non
-- lascia il segno su un campo vuoto, perche' "il sito non lo dice" non e'
-- "il sito dice che non c'e'". Scriverlo qui vorrebbe dire inventare una
-- provenienza per un dato che nessuno ha mai mandato.
--
-- **Tre campi che NON tocca, e perche':**
--
-- - `registration_date` e `vat_regime` arrivano dal **blocco ricco**, che
--   esiste dal 15/09/2026: l'importazione che ha scritto queste righe non li
--   ha mai scritti. In produzione, su queste 58 schede, sono vuoti tutti e
--   due su tutte le righe -- il conto lo conferma invece di fidarsi del
--   ragionamento.
-- - `vehicle_category` **non arriva dal sito**: `payloadDatiVeicolo` lo scrive
--   come la costante "Auto". Segnarlo "dal tuo sito" sarebbe la provenienza
--   sbagliata, che questo progetto ha gia' stabilito essere peggio di nessuna
--   provenienza. Resta senza segno, e la scheda dira' "provenienza non
--   registrata": e' la verita'.
--
--   (Nota per chi legge: sulle schede **vive** oggi quel campo viene segnato
--   `sito` dal ripasso, perche' passa da `payloadDatiVeicolo` come gli altri.
--   E' un'imprecisione del codice, non di questa migration, ed e' segnalata
--   a parte: si corregge li', non replicandola qui.)
--
-- **Nessuna conferma e nessun disaccordo.** Il segno e' esattamente quello di
-- una scheda viva appena letta: `{"fonte": "sito", "confermato_il": null}`.
-- La scheda dira' "dal tuo sito · da confermare", come per tutte le altre.
--
-- **Si puo' rieseguire senza danno**: tocca solo le righe che hanno
-- `origine_dati` ancora vuoto, quindi la seconda volta non trova niente.
--
-- Provata su Postgres 17 il 18/09/2026, ricostruendo i casi veri: una riga
-- piena, una con meta' dei campi vuoti, una gia' segnata (non si tocca), una
-- ancora sul sito (non si tocca), una inserita a mano (non si tocca).
--
-- Attesa in produzione: **58 schede, 1052 campi segnati**, da 11 a 21 campi
-- per scheda.

begin;

with aggiornate as (
  update public.vehicles v
     set origine_dati = coalesce(
           (
             select jsonb_object_agg(c.campo, jsonb_build_object('fonte', 'sito', 'confermato_il', null))
               from (values
                 ('brand',              v.brand::text),
                 ('model',              v.model::text),
                 ('version',            v.version::text),
                 ('price',              v.price::text),
                 ('mileage',            v.mileage::text),
                 ('fuel',               v.fuel::text),
                 ('transmission',       v.transmission::text),
                 ('doors',              v.doors::text),
                 ('seats',              v.seats::text),
                 ('color',              v.color::text),
                 ('body_type',          v.body_type::text),
                 ('year',               v.year::text),
                 ('registration_month', v.registration_month::text),
                 ('vehicle_condition',  v.vehicle_condition::text),
                 ('power_kw',           v.power_kw::text),
                 ('power_cv',           v.power_cv::text),
                 ('engine_size',        v.engine_size::text),
                 ('emission_class',     v.emission_class::text),
                 ('traction',           v.traction::text),
                 ('co2_emissions',      v.co2_emissions::text),
                 ('description',        v.description::text)
               ) as c(campo, valore)
              where c.valore is not null
                and btrim(c.valore) <> ''
           ),
           '{}'::jsonb
         )
   where v.import_source is not null
     and v.import_missing_since is not null
     and v.origine_dati = '{}'::jsonb
  returning v.id, v.origine_dati
)
select
  count(*)                                                                          as schede_aggiornate,
  coalesce(sum((select count(*) from jsonb_object_keys(a.origine_dati))), 0)         as campi_segnati,
  coalesce(min((select count(*) from jsonb_object_keys(a.origine_dati))), 0)         as campi_minimo_per_scheda,
  coalesce(max((select count(*) from jsonb_object_keys(a.origine_dati))), 0)         as campi_massimo_per_scheda
from aggiornate a;

commit;
