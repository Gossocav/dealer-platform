-- Tenere allineato lo stock importato con il sito da cui e' arrivato.
--
-- Due colonne, per due cose che oggi non sappiamo:
--
-- 1. "import_missing_since": da quando questo veicolo non compare piu' sul
--    sito della concessionaria. Serve a distinguere un'auto che abbiamo tolto
--    noi dalla vetrina -- perche' sparita dalla sorgente -- da una che il
--    concessionario ha tolto di sua volonta'. Senza questa distinzione il
--    ripristino automatico rimetterebbe in vetrina anche cio' che qualcuno
--    aveva deciso di togliere.
--
-- 2. "import_synced_at": quando abbiamo riletto per l'ultima volta la sua
--    scheda. La sincronizzazione notturna ha pochi secondi a disposizione e
--    non puo' rileggere centocinquanta pagine per volta: rilegge le piu'
--    vecchie, e questa colonna e' l'unico modo per sapere quali sono.
--
-- Nessuna delle due tocca i dati esistenti: partono vuote, e il valore vuoto
-- significa "mai vista sparita" e "mai riletta".

begin;

alter table public.vehicles add column if not exists import_missing_since timestamptz;
alter table public.vehicles add column if not exists import_synced_at timestamptz;

comment on column public.vehicles.import_missing_since is
  'Da quando il veicolo non compare piu'' sulla sorgente da cui era stato importato. Vuoto se la sorgente lo dichiara ancora.';
comment on column public.vehicles.import_synced_at is
  'Ultima rilettura della scheda sulla sorgente. Vuoto se non e'' mai stata riletta dopo l''importazione.';

-- Serve alla sincronizzazione per pescare le schede piu' vecchie di ogni
-- sorgente. "nulls first" non e' un dettaglio: le mai rilette hanno il valore
-- vuoto e devono venire per prime, mentre Postgres di suo mette i valori
-- assenti in fondo in ordine crescente.
create index if not exists vehicles_import_sync_idx
  on public.vehicles (dealer_id, import_source, import_synced_at nulls first)
  where import_source is not null;

commit;
