-- Il collegamento alle offerte di noleggio della concessionaria.
--
-- Chiesto dal titolare il 03/09/2026: un pulsante "Le nostre offerte di
-- noleggio" sulla pagina pubblica di ogni concessionaria, che porta al suo
-- sito dei noleggi -- per esempio `noleggio.autogepy.it`. Per tutti i piani.
--
-- **Perche' una colonna nuova e non il sito web.** Sono due indirizzi diversi
-- che rispondono a due domande diverse: "chi siete" e "cosa noleggiate". Chi
-- guarda un'automobile e pensa "forse invece la noleggio" non deve finire
-- sulla home del concessionario a cercare la sezione giusta.
--
-- **Il permesso pubblico va rifatto per intero, e questo e' il punto
-- delicato.** Su `dealers` il pubblico ha i permessi colonna per colonna
-- (20260831000000): `grant select (...)` non sostituisce quello di prima, lo
-- affianca, e una colonna aggiunta senza rifare l'elenco resterebbe invisibile
-- al marketplace. Sarebbe il difetto peggiore, perche' silenzioso: il
-- concessionario scrive l'indirizzo, lo vede salvato nelle Impostazioni, e il
-- pulsante non compare a nessuno. L'elenco qui sotto e' quello del
-- 31/08/2026 piu' `rental_url`, e nient'altro: le colonne riservate --
-- account_type, contact_person, fiscal_code, user_id, plan,
-- subscription_plan, subscription_status, tutte le demo_* -- restano fuori.
--
-- L'indirizzo si controlla nell'applicazione (`normalizeWebsiteUrl`) prima di
-- salvarlo, e si ricontrolla in lettura prima di trasformarlo in un pulsante:
-- nel database puo' esserci ancora un indirizzo che non e' un indirizzo, e un
-- pulsante che porta su una pagina morta e' peggio di un pulsante assente.

begin;

alter table public.dealers
  add column if not exists rental_url text;

comment on column public.dealers.rental_url is
  'Indirizzo della pagina noleggi della concessionaria, mostrato come pulsante sulla sua pagina pubblica. Validato in applicazione: vedi src/lib/website-url.ts';

-- L'elenco si riscrive per intero: `grant select (...)` si affianca a quello
-- di prima invece di sostituirlo, e un elenco parziale lascerebbe fuori tutto
-- il resto.
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
  rental_url,
  vat_number,
  opening_hours,
  social_links,
  facebook_url,
  instagram_url,
  linkedin_url,
  status
) on public.dealers to anon;

commit;
