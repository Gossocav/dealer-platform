-- Quattro colonne di `vehicles` che esistevano solo in produzione.
--
--   vat_exposed   plate   co2_emissions   previous_owners
--
-- Erano state aggiunte a mano e il file corrispondente non e' mai stato
-- scritto. In produzione non manca niente: ci sono, e funzionano.
--
-- **Il difetto si vede solo ricostruendo il database da zero**, ed e' stato
-- misurato il 09/09/2026 facendolo davvero: Postgres vuoto, impalcatura di
-- Supabase, e tutte le 102 migration nell'ordine in cui girerebbero. Tre si
-- fermavano, tutte per la stessa riga:
--
--     ERROR: column "vat_exposed" of relation "vehicles" does not exist
--
-- Le tre nominano quelle colonne dentro `grant select (...)`, l'elenco di cio'
-- che la vetrina puo' leggere. Il permesso fallisce, la transazione si annulla,
-- e con essa **tutto il resto di quelle migration**. Il conto era questo:
--
--     colonne che una ricostruzione non creava:  6
--        co2_emissions  plate  previous_owners  vat_exposed
--        video_url      ricerca_testo
--     la ricerca senza accenti:  non esisteva
--
-- Cioe' due funzioni intere -- il video sull'annuncio e la ricerca senza
-- accenti -- sparivano per colpa di quattro colonne mancanti altrove.
--
-- **Perche' la data e' il 30 agosto e non oggi.** Le migration girano in
-- ordine di nome. La prima che nomina queste colonne e' del 31 agosto: un
-- file datato oggi arriverebbe troppo tardi, quando quelle tre si sono gia'
-- fermate. La data dice dove il file deve stare nella fila, non quando e'
-- stato scritto -- ed e' anche il momento in cui queste colonne sarebbero
-- dovute nascere.
--
-- **In produzione non cambia niente**: `add column if not exists` su colonne
-- che ci sono gia' non fa nulla. Applicarla serve solo a tenere allineato il
-- controllo di deriva.

begin;

alter table public.vehicles
  add column if not exists vat_exposed boolean default false,
  add column if not exists plate text,
  add column if not exists co2_emissions integer,
  add column if not exists previous_owners integer;

comment on column public.vehicles.vat_exposed is
  'IVA esposta. Colonna nata a mano in produzione, scritta qui il 09/09/2026 perche una ricostruzione la creasse.';
comment on column public.vehicles.plate is
  'Targa. Colonna nata a mano in produzione, scritta qui il 09/09/2026.';
comment on column public.vehicles.co2_emissions is
  'Emissioni CO2 in g/km. Colonna nata a mano in produzione, scritta qui il 09/09/2026.';
comment on column public.vehicles.previous_owners is
  'Numero di proprietari precedenti. Colonna nata a mano in produzione, scritta qui il 09/09/2026.';

commit;
