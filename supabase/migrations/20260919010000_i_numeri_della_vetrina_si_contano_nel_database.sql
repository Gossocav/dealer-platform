-- I numeri della vetrina si contano nel database, non su un elenco scaricato.
--
-- **Il difetto.** L'elenco delle concessionarie scaricava al massimo 240
-- automobili e da quelle ricavava, per ogni concessionaria, il numero di
-- veicoli pubblicati, il prezzo medio e il prezzo minimo. Le pubblicate al
-- 19/09/2026 sono **279**: trentanove restavano fuori, e i numeri mostrati
-- erano falsi. Misurato rifacendo la stessa identica richiesta sulla
-- produzione:
--
--   AUTOGEPY SPA     mostrava 114 veicoli, ne ha 135
--   De Lorenzi Srl   mostrava  76 veicoli, ne ha  94
--   prezzo minimo De Lorenzi: mostrava 7.500 euro, il vero e' 5.800
--
-- Non e' un taglio che si vede: e' **un numero sbagliato presentato come
-- vero**, la famiglia di difetti che questo progetto ha gia' pagato con lo
-- storico finto e con il costo totale. E peggiora da solo: piu' stock c'e',
-- piu' i numeri si allontanano.
--
-- **Perche' una vista e non un limite piu' alto.** Alzare il tetto a mille
-- sposta il difetto piu' in la' e lo rende piu' raro, quindi piu' difficile
-- da accorgersene. Caricare tutto a pagine (`caricaTutto`) darebbe numeri
-- giusti ma scaricherebbe l'intero parco a ogni visita di una pagina
-- pubblica. Le funzioni di aggregazione di PostgREST, che sarebbero la
-- strada piu' corta, su questo progetto **sono disattivate**: verificato il
-- 19/09/2026 con la chiave pubblica, risponde
-- `PGRST123 "Use of aggregate functions is not allowed"`.
--
-- Resta la vista: il conto lo fa il database, la pagina riceve una riga per
-- concessionaria, e il numero e' esatto qualunque sia lo stock.
--
-- **`security_invoker` e' acceso**, ed e' la riga piu' importante del file.
-- Senza, la vista girerebbe con i permessi di chi la possiede e mostrerebbe
-- anche le automobili che le regole per riga tengono nascoste a chi guarda:
-- una vista e' il modo classico di scavalcare l'isolamento fra
-- concessionarie senza accorgersene. Con `security_invoker` valgono le
-- regole di chi interroga, esattamente come se leggesse `vehicles`.
--
-- **I filtri sono gli stessi del marketplace** e devono restare uguali a
-- quelli di `src/lib/public-marketplace.ts`: `published` vero, stato del
-- veicolo "published", stato della concessionaria "approved" o "active". Un
-- filtro che qui si allontana da quello farebbe dire alla pagina un numero
-- che non corrisponde alle automobili che poi mostra.
--
-- I prezzi: si contano solo quelli **maggiori di zero**, come faceva il
-- codice. Un'automobile senza prezzo non abbassa la media a zero -- e' la
-- regola "un dato mancante non vale zero".
--
-- Provata su Postgres 17 il 19/09/2026 ricostruendo tabelle, ruoli e regole
-- per riga: numeri esatti, `anon` vede solo le pubblicate, e una
-- concessionaria non vede i numeri dell'altra.

begin;

create or replace view public.vetrina_per_concessionaria
with (security_invoker = on) as
  select
    v.dealer_id                                                as dealer_id,
    count(*)                                                   as veicoli_pubblicati,
    round(avg(v.price) filter (where v.price > 0))             as prezzo_medio,
    min(v.price) filter (where v.price > 0)                    as prezzo_minimo
  from public.vehicles v
  join public.dealers d on d.id = v.dealer_id
  where v.published = true
    and v.status = 'published'
    and d.status in ('approved', 'active')
  group by v.dealer_id;

comment on view public.vetrina_per_concessionaria is
  'Quante automobili ha in vetrina ogni concessionaria, e a che prezzi. Si legge dall''elenco pubblico delle concessionarie. I numeri si contano qui e non su un elenco scaricato: il codice ne prendeva al massimo 240 e mostrava numeri falsi (19/09/2026). security_invoker acceso: valgono le regole per riga di chi interroga.';

-- Una vista nuova nasce chiusa e dichiara i suoi permessi, come ogni tabella
-- di questo progetto. Il marketplace legge sempre senza sessione, quindi
-- serve `anon`; `authenticated` lo aggiungiamo perche' la stessa pagina la
-- puo' aprire anche chi ha fatto login, e non vedrebbe niente.
revoke all on public.vetrina_per_concessionaria from public;
grant select on public.vetrina_per_concessionaria to anon, authenticated;

commit;

-- Il conto che si legge nell'editor: una riga per concessionaria con
-- automobili in vetrina. Atteso il 19/09/2026: tre righe -- AUTOGEPY 135,
-- De Lorenzi 94, Ponginibbi 50.
select dealer_id, veicoli_pubblicati, prezzo_medio, prezzo_minimo
  from public.vetrina_per_concessionaria
 order by veicoli_pubblicati desc;
