-- Le colonne che il pubblico non deve leggere.
--
-- La protezione per riga nasconde le **righe**, non le colonne. Su clienti,
-- richieste e appuntamenti basta, perche' sono tabelle che il pubblico non
-- deve vedere per intero: interrogate con la chiave del sito tornano vuote.
--
-- Ma `vehicles` e `dealers` devono essere pubbliche -- sono il marketplace --
-- e siccome lo sono, lo erano in **tutte** le loro colonne. Misurato il
-- 31/08/2026 con la sola chiave pubblica, quella scritta dentro il sito e
-- leggibile da chiunque apra il browser:
--
--   vehicles  ->  1 riga, 44 colonne
--   dealers   ->  1 riga, 38 colonne
--
-- Il fatto che le pagine ne mostrino solo alcune e' una convenzione del
-- nostro codice, e la chiave pubblica il nostro codice lo scavalca.
--
-- Due cose gia' esposte, prima ancora del CRM:
--
--   * il **numero di telaio**, vuoto su tutte le auto ma scrivibile dalla
--     scheda di consegna dal 28/08/2026: e' il dato con cui si clona
--     l'identita' di un'automobile;
--   * le **colonne amministrative della concessionaria** -- piano, stato
--     dell'abbonamento, scadenza della demo, codice fiscale del titolare --
--     cioe' il listino clienti della piattaforma, in chiaro.
--
-- Perche' si revoca e poi si concede, invece di revocare le sole colonne
-- riservate: in PostgreSQL un permesso concesso sulla **tabella** vale su
-- tutte le colonne, e togliere il permesso di una singola colonna non
-- restringe niente finche' quello sulla tabella resta. L'unico modo e'
-- togliere il permesso sulla tabella e riconcederlo colonna per colonna.
--
-- Il modo in cui questa scelta si rompe e' importante: se un domani qualcuno
-- aggiunge una colonna **pubblica** e si scorda di concederla qui, la pagina
-- smette di funzionare e si vede subito. Se avessimo fatto il contrario --
-- elencare le riservate -- una colonna dimenticata sarebbe una perdita
-- silenziosa. Meglio un guasto rumoroso di una falla muta.
--
-- `authenticated` e `service_role` non sono toccati: il concessionario dal
-- gestionale continua a vedere tutto cio' che e' suo, con le regole per riga
-- di sempre.
--
-- Un test (src/lib/colonne-pubbliche.test.ts) confronta gli elenchi qui sotto
-- con le colonne che il codice pubblico chiede davvero, e fallisce se le due
-- cose divergono.

begin;

-- ============================================================
-- vehicles
-- ============================================================
-- Riservate, e quindi assenti dall'elenco: plate, vin, customer_id,
-- import_source, import_source_id, import_missing_since, import_synced_at.

revoke select on public.vehicles from anon;

grant select (
  id,
  dealer_id,
  brand,
  model,
  version,
  year,
  registration_date,
  registration_month,
  mileage,
  price,
  vat_exposed,
  fuel,
  transmission,
  body_type,
  vehicle_category,
  vehicle_condition,
  color,
  doors,
  seats,
  power_kw,
  power_cv,
  engine_size,
  emission_class,
  co2_emissions,
  traction,
  interior_type,
  equipment,
  warranty,
  availability,
  previous_owners,
  description,
  city,
  province,
  status,
  published,
  created_at,
  updated_at
) on public.vehicles to anon;

-- ============================================================
-- dealers
-- ============================================================
-- Riservate: account_type, contact_person, fiscal_code, user_id, plan,
-- subscription_plan, subscription_status, tutte le demo_*, created_at,
-- updated_at.

revoke select on public.dealers from anon;

grant select (
  id,
  name,
  legal_name,
  logo_url,
  description,
  address,
  city,
  province,
  zip_code,
  postal_code,
  phone,
  email,
  whatsapp_phone,
  website,
  vat_number,
  opening_hours,
  social_links,
  facebook_url,
  instagram_url,
  linkedin_url,
  status
) on public.dealers to anon;

commit;
