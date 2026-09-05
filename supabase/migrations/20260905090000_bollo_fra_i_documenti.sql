-- Il bollo entra fra i tipi di documento archiviabili.
--
-- Segnalato dal titolare il 05/09/2026: nella tendina della scheda veicolo
-- c'erano assicurazione, revisione e tagliando, ma non il bollo -- che e' la
-- scadenza che il concessionario paga e conserva su ogni vettura ferma in
-- piazzale, e senza la ricevuta non ha come dimostrarlo.
--
-- Il vincolo non si puo' modificare: in Postgres un CHECK si sostituisce
-- lasciandolo cadere e riscrivendolo per intero. Toccare la migration di
-- partenza (20260903100000) non e' una strada: e' gia' stata applicata in
-- produzione, quindi riscriverla cambierebbe la storia senza cambiare il
-- database.
--
-- L'elenco sta anche in src/lib/archivio-documenti.ts, che disegna la
-- tendina. Un test li confronta riga per riga, e legge il vincolo da qui --
-- l'ultima migration che lo ridefinisce.

alter table public.vehicle_documents
  drop constraint if exists vehicle_documents_tipo_valido;

alter table public.vehicle_documents
  add constraint vehicle_documents_tipo_valido check (doc_type in (
    'libretto',
    'certificato_proprieta',
    'contratto_acquisto',
    'contratto_vendita',
    'preventivo',
    'fattura',
    'assicurazione',
    'bollo',
    'revisione',
    'tagliando',
    'perizia',
    'garanzia',
    'passaggio_proprieta',
    'altro'
  ));

-- Nessun documento gia' archiviato cambia tipo: il vincolo nuovo accetta
-- tutto quello che accettava il vecchio, piu' il bollo. Quindi la riscrittura
-- non puo' fallire su righe esistenti.
