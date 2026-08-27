-- "SUV/Pick-up/Fuoristrada" si divide in due: "SUV" e "Pick-up/Fuoristrada".
--
-- Perche': sono due cose diverse per chi cerca. Stando insieme, chi voleva un
-- fuoristrada si trovava davanti centoventotto SUV.
--
-- Quante sono davvero, misurato il 27/08/2026 rileggendo la carrozzeria dai
-- siti delle due concessionarie sulle 134 automobili che stavano in quella
-- categoria: 109 "SUV", 19 "Crossover", 5 "Fuoristrada", **nessun pick-up**.
--
-- Le righe esistenti vanno tutte su "SUV", che e' vero per centoventotto su
-- centotrentaquattro. Le cinque fuoristrada si spostano da sole entro poche
-- ore: la sincronizzazione rilegge la carrozzeria dal sito di origine e la
-- ritraduce con i sinonimi nuovi, dove "fuoristrada" e "offroad" puntano alla
-- categoria nuova. Nessuno deve rietichettare niente a mano.
--
-- Il vincolo si aggiorna **insieme** ai dati, e non e' un dettaglio: il
-- 22/08/2026 una rinomina di questa stessa voce ha cambiato il codice e
-- lasciato indietro il vincolo, e per cinque giorni il database ha rifiutato
-- ogni SUV -- inserimento a mano compreso. Da allora un test
-- (src/lib/vehicle-body-types-vincolo.test.ts) confronta l'elenco del codice
-- con quello scritto qui dentro.

begin;

-- L'ordine e' obbligato, e sbagliarlo si paga subito: **prima si toglie il
-- vincolo vecchio, poi si aggiornano i dati, poi si mette quello nuovo.**
--
-- Scritta al contrario -- dati prima, vincolo dopo -- questa migration
-- fallisce a meta': l'aggiornamento a 'SUV' avviene mentre e' ancora in vigore
-- il vincolo vecchio, che 'SUV' da solo non lo conosce. Provata davvero su un
-- Postgres in Docker prima di spedirla, ed e' cosi' che si e' visto:
--   ERROR: new row for relation "vehicles" violates check constraint
--          "vehicles_body_type_check"
--
-- Dentro una transazione togliere il vincolo per un istante non lascia
-- scoperto niente: o passa tutto, o non passa niente.
alter table public.vehicles
  drop constraint if exists vehicles_body_type_check;

update public.vehicles
set body_type = 'SUV'
where body_type = 'SUV/Pick-up/Fuoristrada';

-- L'elenco e' lo stesso di VEHICLE_BODY_TYPES in
-- src/lib/vehicle-body-types.ts, e un test fallisce se i due divergono.
alter table public.vehicles
  add constraint vehicles_body_type_check
  check (
    body_type is null or body_type in (
      'SUV', 'Pick-up/Fuoristrada', 'Berlina', 'Station Wagon', 'City Car',
      'Monovolume', 'Coupé', 'Cabrio', 'Furgone/Van'
    )
  );

commit;
