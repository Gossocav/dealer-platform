-- Via le dieci tabelle che nessuna riga di codice tocca.
--
-- Sei nate per un'importazione con profili, esecuzioni e archivio degli
-- errori che non e' mai stata costruita (l'importazione vera legge un file e
-- scrive su `vehicles`), e quattro nate per una coda di invio email che non
-- e' mai servita: il modulo Email manda subito tramite Resend, e usa soltanto
-- `email_threads`, `email_messages` ed `email_delivery_events`, che **restano**.
--
-- **Perche' si tolgono.** Una tabella vuota che nessuno usa non e' neutra:
-- porta con se' regole di accesso, permessi e trigger da mantenere a ogni
-- verifica, compare in ogni inventario, e il giorno che qualcuno le ridara' un
-- permesso le sue regole dormienti si sveglieranno con i requisiti di tre anni
-- fa. Su `email_queue` erano quattro, intestate ad `authenticated`, e
-- avrebbero lasciato leggere, scrivere, modificare e cancellare le righe della
-- propria concessionaria.
--
-- **Verificato prima di scrivere questa migration** (14/09/2026):
--
-- 1. tutte e dieci sono **vuote**: conteggio eseguito dal titolare sull'editor
--    SQL della produzione, dieci righe, tutte a zero;
-- 2. in tutto `src/`, `scripts/` e `.github/` non c'e' una sola riga che le
--    legga o le scriva: gli unici riferimenti sono elenchi di nomi dentro un
--    controllo di sicurezza (`scripts/verifica-isolamento.mjs`) e due test,
--    cioe' codice che verifica che siano **chiuse**, non che le usi;
-- 3. nessuna tabella fuori dal gruppo `import_` le referenzia: le uniche
--    chiavi esterne entranti sono otto, tutte interne al gruppo;
-- 4. l'ordine qui sotto e' stato **provato su Postgres 17 in Docker**.
--    Togliere `import_sources` per prima viene rifiutato, perche' quattro
--    tabelle dipendono da lei.
--
-- **Cosa NON si tocca.** La funzione `public.set_updated_at()`, usata dai
-- trigger di tre di queste tabelle ma anche da `email_messages` e
-- `email_threads`, che restano vive. Si cancellano le tabelle, non la
-- funzione.
--
-- **Il ritorno** sta in `supabase/ritorni/20260914030000_ritorno.sql` e
-- ricrea tutto com'era in produzione -- tabelle, tipi, colonne, vincoli,
-- indici, trigger, protezione per riga e permessi -- con **una sola
-- eccezione, voluta**: le quattro regole dormienti di `email_queue` non si
-- ricreano. Se un giorno servira' una coda di invio, si riprogettera' con i
-- requisiti di allora invece di risvegliare quelle del 22/08/2026.

begin;

-- Se una qualsiasi non fosse piu' vuota, qui dentro ci sono dati che nessuno
-- sa di avere: ci si ferma e si capisce chi ce li ha messi, prima di
-- cancellare qualunque cosa.
do $$
declare
  t text;
  n bigint;
  piene text[] := '{}';
begin
  foreach t in array array[
    'import_sources', 'import_profiles', 'import_runs', 'import_items',
    'import_errors', 'import_dedup_keys', 'email_queue', 'email_attachments',
    'dealer_email_templates', 'platform_email_templates'
  ] loop
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      piene := piene || format('%s (%s righe)', t, n);
    end if;
  end loop;

  if array_length(piene, 1) > 0 then
    raise exception 'Non cancello niente: queste tabelle contengono dati -> %', array_to_string(piene, ', ')
      using hint = 'Erano vuote il 14/09/2026. Capire chi ci ha scritto prima di procedere.';
  end if;
end
$$;

-- L'ordine e' quello provato: prima chi dipende, poi chi e' dipeso.
drop table if exists public.import_dedup_keys;
drop table if exists public.import_errors;
drop table if exists public.import_items;
drop table if exists public.import_runs;
drop table if exists public.import_profiles;
drop table if exists public.import_sources;

-- I quattro tipi enumerati esistevano solo per le tabelle qui sopra.
drop type if exists public.import_item_status_t;
drop type if exists public.import_run_status_t;
drop type if exists public.import_schedule_t;
drop type if exists public.import_source_type_t;

-- Le quattro della posta. Nessuna dipendenza fra loro ne' verso le altre.
drop table if exists public.email_attachments;
drop table if exists public.email_queue;
drop table if exists public.dealer_email_templates;
drop table if exists public.platform_email_templates;

commit;
