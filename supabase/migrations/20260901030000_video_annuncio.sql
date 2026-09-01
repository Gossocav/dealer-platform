-- Il video dell'annuncio: un collegamento a YouTube sulla scheda del veicolo.
--
-- Chiesto dal titolare il 01/09/2026, riservato al Piano Elite. E' un
-- collegamento e non un file: caricare i video sarebbe costato spazio e
-- soprattutto traffico -- un minuto girato col telefono pesa 80-150 MB, e i
-- 250 GB compresi si esauriscono in circa duemila visualizzazioni al mese --
-- e avrebbe richiesto una conversione che non abbiamo.
--
-- **La colonna e' pubblica di proposito**: il video sta sull'annuncio, che e'
-- la pagina che i compratori guardano. Ma su questa tabella il pubblico ha i
-- permessi colonna per colonna (20260831000000), quindi non basta aggiungere
-- la colonna: va rifatto l'elenco per intero, altrimenti il marketplace non
-- la vedrebbe. Le colonne riservate restano fuori, come prima: plate, vin,
-- customer_id e le import_*.
--
-- Il collegamento si valida nell'applicazione (`src/lib/video-annuncio.ts`):
-- si accetta solo YouTube, perche' la Content-Security-Policy apre il riquadro
-- a quel dominio soltanto, e un indirizzo diverso darebbe un riquadro bianco
-- senza spiegazione.

begin;

alter table public.vehicles
  add column if not exists video_url text;

comment on column public.vehicles.video_url is
  'Collegamento a un video YouTube dell''automobile. Solo Piano Elite. Validato in applicazione: vedi src/lib/video-annuncio.ts';

-- L'elenco dei permessi pubblici si riscrive per intero: `grant select (...)`
-- non si aggiunge a quello di prima, lo affianca, e un elenco parziale
-- lascerebbe fuori tutto il resto.
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
  video_url,
  created_at,
  updated_at
) on public.vehicles to anon;

commit;
