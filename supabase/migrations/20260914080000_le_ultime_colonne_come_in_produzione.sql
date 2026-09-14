-- Le ultime colonne che i due lati raccontano diversamente.
--
-- Tre cose, e per ognuna e' stato **misurato** da che parte sta la ragione
-- invece di sceglierla per comodita'.
--
-- **1. Quindici colonne obbligatorie nei file e no in produzione.** Qui ha
-- ragione il file, e non e' un'opinione: contate le righe vuote sulla
-- produzione il 14/09/2026, **sono zero su tutte e quindici** -- comprese
-- `vehicle_images.created_at` e `.is_cover` su 4.779 righe, e
-- `vehicles.created_at`, `.updated_at`, `.published` su 372. Il dato c'e'
-- sempre; manca solo la regola che lo pretende.
--
-- Non e' pignoleria. `vehicles.published` che ammette il vuoto vuol dire che
-- esiste un terzo stato oltre a "in vetrina" e "no", e nessuna parte del
-- codice sa cosa farne: il tetto del piano conta `published = true`, il
-- marketplace filtra `published = true`, e una riga con il campo vuoto non
-- sta ne' di qua ne' di la'.
--
-- Le quattro chiavi di concessionaria non sono qui: le ha gia' chiuse
-- 20260914050000, e non si toccano due volte.
--
-- **2. `audit_logs.actor_type`.** In produzione e' il tipo enumerato
-- `public.audit_actor_type_t` con i valori 'user', 'system', 'api'; nei file
-- e' testo libero. Ha ragione la produzione: un registro di controllo in cui
-- il tipo di chi ha agito puo' essere qualunque stringa non si puo'
-- interrogare con fiducia. Il nome del tipo e i suoi valori non si leggono
-- dall'inventario -- che dice solo "USER-DEFINED" -- e sono stati letti dalla
-- descrizione che PostgREST pubblica dello schema, non indovinati.
--
-- **3. `vehicle_images.updated_at`.** Esiste nei file e non in produzione,
-- nasce nel file di partenza di giugno che in produzione non ha mai girato, e
-- **nessuna riga di codice la legge o la scrive** (la scheda veicoli prende
-- dalle foto solo `id, image_url, position, is_cover`). Si toglie dai file:
-- aggiungerla alla produzione vorrebbe dire creare una colonna che nessuno
-- usera' mai.
--
-- **Applicata alla produzione, il punto 1 cambia davvero qualcosa** -- mette
-- quindici regole che oggi non ci sono -- mentre i punti 2 e 3 non la toccano.
-- Il punto 1 e' protetto dallo stesso controllo della migration delle chiavi:
-- se una colonna avesse anche una sola riga vuota, non viene toccata e lo
-- dice, invece di far fallire tutto a meta'.

begin;

-- ---------------------------------------------------------------------------
-- 1. Quindici colonne che il dato ce l'hanno sempre.
-- ---------------------------------------------------------------------------

do $$
declare
  coppia text[];
  n bigint;
  saltate text[] := '{}';
begin
  foreach coppia slice 1 in array array[
    array['appointments', 'created_at'],
    array['appointments', 'updated_at'],
    array['customers', 'created_at'],
    array['customers', 'updated_at'],
    array['demo_requests', 'city'],
    array['demo_requests', 'company_name'],
    array['demo_requests', 'phone'],
    array['leads', 'created_at'],
    array['profiles', 'created_at'],
    array['profiles', 'updated_at'],
    array['vehicle_images', 'created_at'],
    array['vehicle_images', 'is_cover'],
    array['vehicles', 'created_at'],
    array['vehicles', 'published'],
    array['vehicles', 'updated_at']
  ] loop
    execute format('select count(*) from public.%I where %I is null', coppia[1], coppia[2]) into n;
    if n = 0 then
      execute format('alter table public.%I alter column %I set not null', coppia[1], coppia[2]);
    else
      saltate := saltate || format('%s.%s (%s righe vuote)', coppia[1], coppia[2], n);
    end if;
  end loop;

  if array_length(saltate, 1) > 0 then
    raise notice 'Lasciate come sono, hanno righe vuote: %', array_to_string(saltate, ', ');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Il tipo di chi ha agito, nel registro di controllo.
--    In produzione il tipo esiste gia' e la colonna e' gia' sua: qui dentro
--    non si entra.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'audit_actor_type_t'
  ) then
    create type public.audit_actor_type_t as enum ('user', 'system', 'api');
  end if;

  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'actor_type') = 'text' then
    alter table public.audit_logs
      alter column actor_type type public.audit_actor_type_t
      using actor_type::public.audit_actor_type_t;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. La colonna che nessuno usa e che la produzione non ha mai avuto.
-- ---------------------------------------------------------------------------

alter table public.vehicle_images drop column if exists updated_at;

commit;
