-- Da dove viene ogni dato di una scheda veicolo.
--
-- **Perche' serve prima di tutto il resto.** Dalla Fase 1 in poi KeyAuto
-- scrive sulle schede dati che **non ha scritto il concessionario**: li legge
-- dal suo sito. Dal momento in cui succede, tre domande diventano
-- indispensabili e senza questa colonna non hanno risposta:
--
-- 1. questo numero l'ha scritto lui o l'abbiamo letto noi?
-- 2. se l'abbiamo letto noi, il suo sito lo **dichiarava** o il suo fornitore
--    lo ha **dedotto**?
-- 3. lui l'ha **confermato**?
--
-- Aggiungerla dopo non si puo': una volta scritti i dati senza sapere da dove
-- vengono, non si distingue piu' cio' che il concessionario ha approvato da
-- cio' che abbiamo dedotto noi. E' il genere di cosa che non si recupera.
--
-- **Le tre regole che questa colonna rende possibili**, decise dal titolare il
-- 14/09/2026:
--
-- * **la provenienza e' sempre leggibile.** Un numero non si mostra mai nudo:
--   accanto c'e' sempre "dal tuo sito", "scritto da te" o "calcolato da
--   KeyAuto". Se la dicitura non si vede, il dato non si mostra;
-- * **un dato proposto si mostra ma non si usa.** Finche' non e' confermato
--   non entra nella giacenza, non entra nel margine, non entra nella priorita'
--   del tetto del piano e non conta nella completezza;
-- * **un dato scritto dal concessionario non viene MAI sovrascritto dalla
--   sincronizzazione**, nemmeno se il sito cambia idea. Vedi la nota qui
--   sotto: e' la regola piu' importante delle tre.
--
-- **La forma.** Un oggetto solo per scheda, non una colonna per campo:
--
--     {
--       "registration_date": { "fonte": "sito",    "confermato_il": "2026-09-15" },
--       "vat_regime":        { "fonte": "sito",    "confermato_il": null },
--       "entered_on":        { "fonte": "dedotto", "confermato_il": null },
--       "purchase_price":    { "fonte": "dealer" }
--     }
--
-- Le fonti ammesse sono tre: `sito` (il sito lo dichiara), `dedotto` (il
-- fornitore l'ha riempito da solo, e vale meno), `dealer` (l'ha scritto lui).
-- `confermato_il` assente o nullo vuol dire **proposto**.
--
-- **Perche' un oggetto e non una colonna per campo.** Con una colonna per
-- campo servirebbe una migration per ogni campo nuovo, e i campi di cui
-- tracciare la provenienza sono gia' otto e cresceranno. L'oggetto non si
-- indicizza bene, ed e' il suo difetto -- ma l'unica domanda che faremo e'
-- "quante auto di questa concessionaria hanno la targa confermata", su
-- qualche centinaio di righe. Il progetto usa gia' `jsonb` per gli snapshot
-- dei piani.
--
-- **Nessuna pagina la legge a mano.** Una funzione sola,
-- `src/lib/provenienza-dati.ts`, e un test che fallisce se qualcuno la
-- interroga da un'altra parte. Vale la stessa ragione del tetto del piano:
-- una regola in due copie diverge.
--
-- **Non e' pubblica.** I permessi su `vehicles` sono colonna per colonna, e
-- una colonna nuova nasce chiusa: il pubblico non deve sapere cosa il
-- concessionario ha confermato e cosa no.

begin;

alter table public.vehicles
  add column if not exists origine_dati jsonb not null default '{}'::jsonb;

comment on column public.vehicles.origine_dati is
  'Da dove viene ogni campo di questa scheda: { "campo": { "fonte": "sito|dedotto|dealer", "confermato_il": "AAAA-MM-GG" } }. Fonte "dealer" non si sovrascrive mai. Si legge solo da src/lib/provenienza-dati.ts.';

-- Un oggetto, non una lista: se un giorno qualcuno ci scrivesse dentro un
-- array il codice che lo legge si romperebbe in silenzio.
alter table public.vehicles drop constraint if exists vehicles_origine_dati_e_un_oggetto;
alter table public.vehicles
  add constraint vehicles_origine_dati_e_un_oggetto
  check (jsonb_typeof(origine_dati) = 'object');

commit;
