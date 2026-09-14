-- Venti colonne che la produzione ha, e i file no.
--
-- **Perche' esiste questa differenza.** Quasi tutte le tabelle di questo
-- progetto sono nate a mano nell'editor SQL di Supabase, e le migration che le
-- descrivono usano `create table if not exists`: in produzione quelle tabelle
-- esistevano gia', quindi **la descrizione scritta nei file non e' mai stata
-- eseguita la'**. I due lati non sono in disaccordo perche' qualcuno ha
-- cambiato qualcosa: sono in disaccordo perche' i file non hanno mai avuto
-- occasione di parlare.
--
-- **Su tutte e venti ha ragione la produzione.** Questa migration allinea i
-- file, e **applicata alla produzione non cambia niente**: ogni istruzione e'
-- condizionata a cio' che gia' c'e'. Serve perche' una ricostruzione da zero
-- -- un ripristino dopo un guasto, o una copia di prova -- produca lo stesso
-- database di quello vero, invece di uno con nove colonne in meno e sei tipi
-- sbagliati.
--
-- Non sono tutte le differenze sulle colonne: restano quelle dove a sbagliare
-- e' la produzione (le quattro chiavi di concessionaria, in
-- 20260914050000) e quelle dove la risposta giusta va ancora decisa.
--
-- **Cosa NON c'e' qui.** `audit_logs.actor_type`: in produzione e' un tipo
-- enumerato e nei file e' testo, ma il nome di quel tipo e i suoi valori non
-- si leggono dall'inventario. Va guardato a parte, non indovinato.

begin;

-- ---------------------------------------------------------------------------
-- 1. Nove colonne che in produzione ci sono e nei file no.
--    `if not exists` le rende innocue dove gia' esistono.
-- ---------------------------------------------------------------------------

alter table public.audit_logs add column if not exists ip         inet;
alter table public.audit_logs add column if not exists request_id text;
alter table public.audit_logs add column if not exists session_id text;
alter table public.audit_logs add column if not exists user_agent text;

alter table public.customers add column if not exists customer_type text default 'private'::text;
alter table public.customers add column if not exists fiscal_code   text;

alter table public.dealers   add column if not exists fiscal_code   text;

alter table public.leads     add column if not exists assigned_to    text;
alter table public.leads     add column if not exists internal_notes text;

-- ---------------------------------------------------------------------------
-- 2. Sei colonne il cui TIPO o valore predefinito e' giusto in produzione.
--    Ogni conversione avviene solo se il tipo e' ancora quello vecchio: in
--    produzione la condizione e' gia' falsa e non succede niente.
-- ---------------------------------------------------------------------------

-- Una data scritta come testo non si ordina e non si confronta: "09/2025" sta
-- prima di "1/2024". In produzione e' `date` dal giorno che qualcuno l'ha
-- corretta a mano; nei file e' rimasta `text` da 20260702.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'vehicles' and column_name = 'registration_date') = 'text' then
    alter table public.vehicles alter column registration_date type date using nullif(registration_date, '')::date;
  end if;
end
$$;

-- La cilindrata e' un numero: come testo "1600" e "1.600" sono due cose
-- diverse, e nessuna delle due si somma.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'vehicles' and column_name = 'engine_size') = 'text' then
    alter table public.vehicles alter column engine_size type integer using nullif(regexp_replace(engine_size, '\D', '', 'g'), '')::integer;
  end if;
end
$$;

-- Quante auto ha la concessionaria che chiede la prova: e' un conteggio.
--
-- **Qui serve un passaggio in piu'**, trovato provando la migration su
-- Postgres 17 invece che immaginandola: Postgres rifiuta di cambiare il tipo
-- di una colonna **nominata da una regola di accesso**, e
-- `demo_requests_insert_public` pretende `vehicle_count is not null`. La
-- regola si toglie e si rimette identica -- stesso nome, stesso comando,
-- stesso ruolo, stesso controllo -- attorno alla conversione. In produzione la
-- colonna e' gia' un numero, quindi qui dentro non si entra nemmeno e la
-- regola non viene sfiorata.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'demo_requests' and column_name = 'vehicle_count') = 'text' then

    drop policy if exists demo_requests_insert_public on public.demo_requests;

    alter table public.demo_requests alter column vehicle_count drop not null;
    alter table public.demo_requests alter column vehicle_count type integer using nullif(regexp_replace(vehicle_count, '\D', '', 'g'), '')::integer;

    create policy demo_requests_insert_public on public.demo_requests
      for insert to anon
      with check (
        status = 'pending'::text
        and btrim(dealership_name) <> ''::text
        and btrim(contact_name) <> ''::text
        and btrim(email) <> ''::text
        and btrim(phone) <> ''::text
        and btrim(mobile_phone) <> ''::text
        and btrim(city) <> ''::text
        and vehicle_count is not null
      );
  end if;
end
$$;

-- Tre valori predefiniti che la produzione ha e i file no. Senza, una riga
-- inserita senza quel campo esce diversa nei due database.
alter table public.appointments   alter column appointment_type set default 'call'::text;
alter table public.profiles       alter column id               set default gen_random_uuid();
alter table public.vehicle_images alter column position         set default 0;

-- ---------------------------------------------------------------------------
-- 3. Cinque colonne che in produzione sono obbligatorie e nei file no.
--    Qui la produzione e' piu' severa, ed e' giusto: una vettura senza marca
--    o un contatto senza nome non servono a nessuno.
--    Si applica solo se non ci sono righe vuote, cosi' su una ricostruzione
--    con dati di prova non fallisce a meta'.
-- ---------------------------------------------------------------------------

do $$
declare
  coppia text[];
  n bigint;
begin
  foreach coppia slice 1 in array array[
    array['appointments', 'title'],
    array['customers', 'first_name'],
    array['leads', 'first_name'],
    array['vehicles', 'brand'],
    array['vehicles', 'model']
  ] loop
    execute format('select count(*) from public.%I where %I is null', coppia[1], coppia[2]) into n;
    if n = 0 then
      execute format('alter table public.%I alter column %I set not null', coppia[1], coppia[2]);
    else
      raise notice 'Lascio % .% come e'': ci sono % righe senza valore.', coppia[1], coppia[2], n;
    end if;
  end loop;
end
$$;

commit;
