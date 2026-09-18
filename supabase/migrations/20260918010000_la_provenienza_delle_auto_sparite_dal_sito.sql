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
-- non hanno nessun segno, e sono tutte sparite dal sito. A schermo direbbero
-- "provenienza non registrata" su ogni campo, **per sempre**: nessun giro
-- notturno le tocchera' mai piu'. E sono proprio le schede che il
-- concessionario apre per chiedersi che fine ha fatto un'automobile.
--
-- **Questa non e' una rilettura: e' registrare quello che gia' sappiamo.**
-- Quelle righe le ha scritte l'importazione dal sito, e si scrive il segno che
-- il ripasso avrebbe scritto se fosse potuto passare.
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
--   ha mai scritti. In produzione, su queste schede, sono vuoti tutti e due
--   su tutte le righe -- il conto lo conferma invece di fidarsi del
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
--   a parte: si corregge li', non replicandola qui. Correggerla **non rompe
--   niente**: ne' questa migration ne' il suo ritorno ci si appoggiano.)
--
-- **Una scheda che il concessionario ha aperto e salvato resta fuori.** E' il
-- caso piu' insidioso, e non si vede ragionando: prima del 15/09/2026 una
-- modifica a mano non lasciava **nessun** segno, quindi su una scheda salvata
-- in quella finestra il valore che c'e' oggi puo' essere suo, e non del sito.
-- Segnarlo "dal tuo sito" sarebbe esattamente la provenienza sbagliata.
-- Chi ha salvato lascia traccia in `audit_logs` con `vehicle.updated`
-- (`vehicle-editor-page.tsx`, unico posto che scrive quell'azione), e quelle
-- schede si saltano: restano a "provenienza non registrata", che e' la
-- verita'. In produzione il 18/09/2026 e' **una sola** -- una Nissan Micra,
-- salvata il 10/09 -- ma quella sola sarebbe stata l'unica bugia scritta da
-- questa migration.
--
-- **Cosa quella traccia NON copre**, detto perche' non sembri una garanzia
-- piu' grande di quello che e': un'importazione da **feed** puo' agganciare
-- una scheda gia' in archivio (per telaio, o per marca+modello+versione+anno)
-- e riscriverne i campi **senza** lasciare niente in `audit_logs`. Oggi non
-- e' successo: delle 372 schede in produzione, 370 hanno `import_source` di
-- un sito e le altre due sono state inserite a mano -- nessuna riga e' mai
-- nata da un feed. Il giorno che una concessionaria mandasse anche un feed,
-- questa esclusione andrebbe allargata.
--
-- **Nessuna conferma e nessun disaccordo**, e una cosa in piu' che dice la
-- verita': `ricostruito_il`.
--
--     {"fonte": "sito", "confermato_il": null, "ricostruito_il": "2026-09-18"}
--
-- Un segno normale nasce mentre si legge il sito: si e' **visto** quel valore
-- arrivare, quel giorno. Qui il sito non si puo' piu' leggere, e il segno e'
-- **dedotto** da quello che l'importazione aveva scritto. Il valore viene dal
-- sito -- questo si sa -- ma nessuno l'ha visto arrivare in quel momento: e'
-- la stessa distinzione fra "misurato" e "dedotto" che vale per la data
-- d'ingresso, e tacerla sarebbe buttare un'informazione vera.
--
-- A schermo non cambia niente: la scheda continua a dire "dal tuo sito · da
-- confermare", perche' quella frase resta vera. E il segno **sparisce da
-- solo** se quella scheda tornasse sul sito e venisse riletta davvero:
-- `scriviDalSito` sostituisce il segno intero, e la ricostruzione lascia il
-- posto a un'osservazione.
--
-- E' anche cio' che permette al ritorno di riconoscere **le sue** schede senza
-- appoggiarsi a niente di esterno: vedi il file in `supabase/ritorni/`.
--
-- **Si puo' rieseguire senza danno**: tocca solo le righe che hanno
-- `origine_dati` ancora vuoto, quindi la seconda volta non trova niente.
--
-- Provata su Postgres 17, ricostruendo i casi veri: una riga piena, una con
-- meta' dei campi vuoti, una con prezzo e chilometri a zero (zero e' un
-- valore e prende il segno), una gia' segnata, una ancora sul sito, una
-- inserita a mano, una salvata dal concessionario, una senza nemmeno un
-- campo, una con un campo di sole tabulazioni.
--
-- **Attesa in produzione: 57 schede segnate, 1031 campi**, da 11 a 21 campi
-- per scheda, e **1 scheda che resta senza provenienza** (quella salvata a
-- mano). I numeri sono contati sui dati veri prima di scrivere questo SQL.

begin;

-- **Un controllo prima di cominciare, con una frase che si capisce.**
--
-- `trg_enforce_plate_on_sold` scatta su **qualunque** aggiornamento di una
-- riga, anche su uno che non tocca ne' la targa ne' lo stato. Se fra le
-- schede da segnare ce ne fosse una "venduta" senza targa ne' telaio, il
-- database fermerebbe tutta la transazione dicendo *"Per segnare una vettura
-- come venduta serve la targa o il numero di telaio"* -- mentre si sta
-- scrivendo la provenienza, che con le targhe non c'entra niente. Meglio
-- fermarsi prima e dire perche'.
--
-- In produzione il 18/09/2026 sono **zero**: questo controllo serve se nel
-- frattempo qualcosa fosse cambiato.
do $$
declare bloccanti integer;
begin
  select count(*) into bloccanti
    from public.vehicles v
   where v.import_source is not null
     and btrim(v.import_source) <> ''
     and v.import_missing_since is not null
     and v.origine_dati = '{}'::jsonb
     and lower(coalesce(v.status, '')) in ('sold', 'delivered')
     and coalesce(btrim(v.plate), '') = ''
     and coalesce(btrim(v.vin), '') = '';
  if bloccanti > 0 then
    raise exception 'Fermato prima di cominciare: % schede fra quelle da segnare risultano vendute senza targa ne'' telaio. Il database rifiuta qualunque modifica su quelle righe, e la scrittura della provenienza fallirebbe con un messaggio che parla di targhe. Scrivi targa o telaio su quelle schede, poi riprova.', bloccanti;
  end if;
end $$;

with da_segnare as (
  select
    v.id,
    (
      select jsonb_object_agg(
               c.campo,
               jsonb_build_object('fonte', 'sito', 'confermato_il', null, 'ricostruito_il', '2026-09-18')
             )
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
       -- "Ha un valore" vuol dire almeno un carattere che non sia spazio: non
       -- basta `btrim`, che toglie solo lo spazio normale e lascerebbe passare
       -- un campo fatto di una tabulazione o di un a capo. E nemmeno basta
       -- `[:space:]`, che **non comprende lo spazio unificatore** (U+00A0):
       -- dalle pagine HTML arriva di continuo, e un campo fatto solo di quello
       -- risulterebbe "dichiarato dal sito" pur essendo vuoto a ogni effetto.
       -- Provato su Postgres 17: spazio unificatore, tabulazione, a capo,
       -- spazi e stringa vuota non valgono; "Rosso" e "0" si'.
       where c.valore is not null
         and c.valore ~ ('[^[:space:]' || U&'\00a0' || ']')
    ) as segni
  from public.vehicles v
  where v.import_source is not null
    and btrim(v.import_source) <> ''
    and v.import_missing_since is not null
    and v.origine_dati = '{}'::jsonb
    -- La scheda che il concessionario ha aperto e salvato: non sappiamo piu'
    -- quali valori siano suoi, quindi non ne dichiariamo nessuno.
    and not exists (
      select 1
        from public.audit_logs a
       where a.entity_type = 'vehicle'
         and a.entity_id = v.id
         and a.action = 'vehicle.updated'
    )
)
update public.vehicles v
   set origine_dati = d.segni
  from da_segnare d
 where d.id = v.id
   -- Una riga senza nemmeno un campo valorizzato non si tocca: scriverle un
   -- oggetto vuoto sarebbe un aggiornamento che non aggiorna niente, e la
   -- farebbe ricomparire nel conto a ogni riesecuzione.
   and d.segni is not null;

commit;

-- Il conto che si legge nell'editor SQL: **l'ultima istruzione e' questa**, e
-- non il `commit`, che non restituisce niente e mostrerebbe soltanto
-- "Success. No rows returned".
--
-- Le schede segnate da questa migration si riconoscono dal segno che portano,
-- `ricostruito_il`: nessun'altra porta lo scrive, quindi questo conto non
-- dipende da niente che possa cambiare altrove. Prima di eseguire erano zero.
select
  count(*) filter (where v.origine_dati @? '$.*.ricostruito_il') as schede_segnate_da_questa_migration,
  coalesce(
    sum((select count(*) from jsonb_object_keys(v.origine_dati)))
      filter (where v.origine_dati @? '$.*.ricostruito_il'),
    0
  ) as campi_segnati,
  count(*) filter (where v.origine_dati = '{}'::jsonb) as ancora_senza_provenienza,
  count(*) filter (
    where v.origine_dati <> '{}'::jsonb and not (v.origine_dati @? '$.*.ricostruito_il')
  ) as gia_segnate_dal_ripasso,
  -- Le due ipotesi su cui poggia la scelta di non toccare questi due campi,
  -- trasformate in numeri che si leggono davvero invece di restare scritte in
  -- un commento. Attesi: **1 e 0** -- l'unica immatricolazione piena sta su
  -- una scheda gia' segnata dal ripasso, non fra quelle che si toccano qui.
  count(*) filter (where v.registration_date is not null) as con_immatricolazione_piena,
  count(*) filter (where v.vat_regime is not null) as con_regime_iva
from public.vehicles v
where v.import_source is not null
  and v.import_missing_since is not null;
