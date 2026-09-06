-- Chi cerca "citroen" deve trovare le Citroen.
--
-- Misurato sulla produzione il 06/09/2026, con la sola chiave pubblica:
--
--     Veicoli pubblicati:          296
--     Con marca accentata:          36    (Citroen 35, Skoda 1)
--
--     chi cerca "citroen"     trova   1   invece di 35
--     chi cerca "skoda"       trova   0   invece di 1
--     chi cerca "citroen c3"  trova   0   anche scrivendo l'accento
--
-- Due cause diverse, e questa migration le toglie tutte e due.
--
-- **Gli accenti.** Nel database la marca e' scritta `Citroen` con la dieresi,
-- e `ilike '%citroen%'` non la trova. Praticamente nessuno scrive la dieresi:
-- il 12% del parco non si faceva trovare da chi lo cercava per nome.
--
-- **Le parole.** Il filtro confrontava la frase intera dentro una colonna
-- sola (marca, oppure modello, oppure allestimento), quindi "citroen c3" non
-- poteva funzionare per costruzione: nessuna singola colonna contiene
-- entrambe le parole. Ed e' il modo piu' naturale di cercare un'auto.
--
-- La colonna `ricerca_testo` mette marca, modello e allestimento in un testo
-- solo, gia' senza accenti e in minuscolo. Cosi' ogni parola scritta da chi
-- cerca si confronta con tutto insieme, e l'ordine non conta piu'.

begin;

create extension if not exists unaccent;

-- unaccent() e' dichiarata STABLE, non IMMUTABLE, e una colonna generata
-- accetta solo funzioni immutabili. Questo involucro la dichiara immutabile:
-- e' la soluzione consueta, e va detto cosa comporta -- se un giorno cambiasse
-- il dizionario degli accenti, i valori gia' salvati e l'indice resterebbero
-- quelli vecchi. Il dizionario non cambia mai, e il prezzo dell'alternativa
-- (niente indice, ricerca lenta su tutto il parco) sarebbe pagato ogni
-- giorno.
--
-- `search_path` nomina due schemi perche' l'estensione puo' finire in
-- `public` (come pg_trgm in questo progetto) o in `extensions` (dove Supabase
-- mette le proprie). Cosi' la funzione trova `unaccent` in entrambi i casi,
-- invece di rompersi in produzione per una differenza che in locale non si
-- vede.
create or replace function public.senza_accenti(t text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public, extensions
as $$
  select lower(unaccent(t))
$$;

-- Chi puo' eseguirla, e perche' non e' una formalita'.
--
-- `authenticated` **deve** poterla eseguire: la colonna generata si calcola
-- al momento della scrittura, con i permessi di chi scrive. Verificato su un
-- Postgres vero togliendogli il permesso -- salvare un veicolo fallisce con
-- "permission denied for function senza_accenti". Sarebbe stato un
-- concessionario che non riesce piu' a inserire un'auto.
--
-- `anon` non le serve: legge soltanto, e in lettura la colonna e' un valore
-- gia' salvato, non una funzione da eseguire. Verificato: dopo il revoke un
-- visitatore continua a trovare le Citroen, ma non puo' chiamare la funzione
-- da /rest/v1/rpc.
revoke all on function public.senza_accenti(text) from public;
revoke all on function public.senza_accenti(text) from anon;
grant execute on function public.senza_accenti(text) to authenticated, service_role;

comment on function public.senza_accenti(text) is
  'Testo in minuscolo e senza accenti, per la ricerca veicoli. Dichiarata IMMUTABLE per poter essere usata in una colonna generata: vedi la migration 20260906160000.';

alter table public.vehicles
  add column if not exists ricerca_testo text generated always as (
    public.senza_accenti(
      coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(version, '')
    )
  ) stored;

comment on column public.vehicles.ricerca_testo is
  'Marca, modello e allestimento in un testo solo, senza accenti e in minuscolo. Si aggiorna da sola: non scriverci mai sopra.';

-- Senza indice ogni ricerca leggerebbe tutto il parco. Trigram perche' si
-- cerca per pezzi di parola (`%citroen%`), e per quel tipo di confronto un
-- indice normale non serve a niente.
create index if not exists vehicles_ricerca_testo_trgm_idx
  on public.vehicles using gin (ricerca_testo gin_trgm_ops);

-- L'elenco dei permessi pubblici si riscrive per intero: `grant select (...)`
-- non si aggiunge a quello di prima, lo affianca, e un elenco parziale
-- lascerebbe fuori tutto il resto.
--
-- Senza `ricerca_testo` qui dentro la vetrina pubblica non potrebbe filtrarci
-- sopra, e la ricerca risponderebbe errore a ogni visitatore. Le 38 colonne
-- qui sotto sono quelle gia' concesse: verificate contro la produzione il
-- 06/09/2026 chiedendole tutte insieme con la chiave pubblica (HTTP 200).
--
-- `authenticated` non compare: ha gia' il permesso sull'intera tabella
-- (rls_vehicles_policies.sql), che vale anche per le colonne nuove.
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
  updated_at,
  ricerca_testo
) on public.vehicles to anon;

commit;
