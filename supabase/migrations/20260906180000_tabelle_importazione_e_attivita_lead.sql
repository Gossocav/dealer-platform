-- Le sette tabelle che esistevano solo in produzione.
--
-- import_sources, import_profiles, import_runs, import_items, import_errors,
-- import_dedup_keys, lead_activities: esistono nel database ma **nessuna
-- migration le creava**. Erano state fatte a mano, e il file corrispondente
-- non e' mai stato scritto.
--
-- In produzione non manca niente e non c'e' niente da applicare: queste
-- tabelle ci sono, sono protette, e funzionano. Questo file serve al giorno
-- che il database venga ricostruito da zero -- un ambiente nuovo, un
-- ripristino dopo un guasto. Senza, quel giorno non nascerebbero, e con esse
-- sparirebbero l'importazione veicoli e lo storico dei contatti.
--
-- Come e' stato scritto: **non a memoria e non da una fotografia**. Il
-- contenuto e' stato letto dalla produzione con tre interrogazioni di sola
-- lettura (colonne, vincoli e indici, protezione e permessi) il 06/09/2026, e
-- poi riapplicato a un Postgres vuoto e riconfrontato riga per riga con
-- quello che la produzione aveva risposto.
--
-- Un errore che questo giro ha evitato: leggendo gli stessi dati da una
-- schermata, l'elenco `import_source_type_t` sembrava contenere anche 'xml'.
-- Il testo vero dice `csv, api, manual, feed`. Un valore in piu' in un
-- elenco e' il tipo di sbaglio che non si vede finche' qualcuno non ci
-- inciampa.
--
-- **I permessi qui sono piu' stretti di quelli che la produzione ha oggi**, ed
-- e' voluto. In produzione queste sette tabelle hanno `grant all` ad
-- `authenticated`: sette permessi invece dei quattro che hanno tutte le altre
-- tabelle del progetto (vehicles, leads, customers). Fra i tre in piu' c'e'
-- `truncate`, che **scavalca la protezione per riga** -- verificato su un
-- Postgres vero: un `delete` sulle righe altrui viene fermato, un `truncate`
-- le cancella tutte. Non e' raggiungibile dall'applicazione, perche' PostgREST
-- non espone quel comando, ma non c'e' motivo di concederlo. Applicare questo
-- file alla produzione allineerebbe anche quello: e' una decisione a se', da
-- prendere con calma.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'import_item_status_t') then
    create type public.import_item_status_t as enum ('pending', 'imported', 'updated', 'duplicate', 'error', 'skipped');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'import_run_status_t') then
    create type public.import_run_status_t as enum ('pending', 'running', 'completed', 'completed_with_errors', 'failed');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'import_schedule_t') then
    create type public.import_schedule_t as enum ('manual', 'daily', 'weekly', 'monthly');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'import_source_type_t') then
    create type public.import_source_type_t as enum ('csv', 'api', 'manual', 'feed');
  end if;
end $$;

create table if not exists public.import_sources (
  id uuid default gen_random_uuid() not null,
  dealer_id uuid not null,
  name text not null,
  source_type public.import_source_type_t not null,
  endpoint_url text,
  auth_type text,
  schedule_type public.import_schedule_t not null,
  active boolean default true not null,
  config_json jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_sources_created_by_fkey' and conrelid = 'public.import_sources'::regclass) then
    alter table public.import_sources add constraint import_sources_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_sources_dealer_id_fkey' and conrelid = 'public.import_sources'::regclass) then
    alter table public.import_sources add constraint import_sources_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_sources_deleted_by_fkey' and conrelid = 'public.import_sources'::regclass) then
    alter table public.import_sources add constraint import_sources_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_sources_pkey' and conrelid = 'public.import_sources'::regclass) then
    alter table public.import_sources add constraint import_sources_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_sources_updated_by_fkey' and conrelid = 'public.import_sources'::regclass) then
    alter table public.import_sources add constraint import_sources_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

alter table public.import_sources enable row level security;

alter table public.import_sources force row level security;

grant select, insert, update, delete on public.import_sources to authenticated, service_role;

create table if not exists public.import_profiles (
  id uuid default gen_random_uuid() not null,
  dealer_id uuid not null,
  source_id uuid not null,
  name text not null,
  mapping_json jsonb default '{}'::jsonb not null,
  transform_json jsonb default '{}'::jsonb not null,
  validation_json jsonb default '{}'::jsonb not null,
  active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_profiles_created_by_fkey' and conrelid = 'public.import_profiles'::regclass) then
    alter table public.import_profiles add constraint import_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_profiles_dealer_id_fkey' and conrelid = 'public.import_profiles'::regclass) then
    alter table public.import_profiles add constraint import_profiles_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_profiles_deleted_by_fkey' and conrelid = 'public.import_profiles'::regclass) then
    alter table public.import_profiles add constraint import_profiles_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_profiles_pkey' and conrelid = 'public.import_profiles'::regclass) then
    alter table public.import_profiles add constraint import_profiles_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_profiles_source_id_fkey' and conrelid = 'public.import_profiles'::regclass) then
    alter table public.import_profiles add constraint import_profiles_source_id_fkey FOREIGN KEY (source_id) REFERENCES import_sources(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_profiles_updated_by_fkey' and conrelid = 'public.import_profiles'::regclass) then
    alter table public.import_profiles add constraint import_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

alter table public.import_profiles enable row level security;

alter table public.import_profiles force row level security;

grant select, insert, update, delete on public.import_profiles to authenticated, service_role;

create table if not exists public.import_runs (
  id uuid default gen_random_uuid() not null,
  dealer_id uuid not null,
  source_id uuid not null,
  import_profile_id uuid,
  status public.import_run_status_t not null,
  mode text not null,
  started_at timestamptz,
  finished_at timestamptz,
  total_rows integer default 0 not null,
  imported_rows integer default 0 not null,
  updated_rows integer default 0 not null,
  error_rows integer default 0 not null,
  duplicate_rows integer default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_runs_created_by_fkey' and conrelid = 'public.import_runs'::regclass) then
    alter table public.import_runs add constraint import_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_runs_dealer_id_fkey' and conrelid = 'public.import_runs'::regclass) then
    alter table public.import_runs add constraint import_runs_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_runs_deleted_by_fkey' and conrelid = 'public.import_runs'::regclass) then
    alter table public.import_runs add constraint import_runs_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_runs_import_profile_id_fkey' and conrelid = 'public.import_runs'::regclass) then
    alter table public.import_runs add constraint import_runs_import_profile_id_fkey FOREIGN KEY (import_profile_id) REFERENCES import_profiles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_runs_pkey' and conrelid = 'public.import_runs'::regclass) then
    alter table public.import_runs add constraint import_runs_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_runs_source_id_fkey' and conrelid = 'public.import_runs'::regclass) then
    alter table public.import_runs add constraint import_runs_source_id_fkey FOREIGN KEY (source_id) REFERENCES import_sources(id) ON DELETE RESTRICT;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_runs_updated_by_fkey' and conrelid = 'public.import_runs'::regclass) then
    alter table public.import_runs add constraint import_runs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

create index if not exists import_runs_dealer_source_started_desc_idx ON public.import_runs USING btree (dealer_id, source_id, started_at DESC);

create index if not exists import_runs_dealer_status_started_desc_idx ON public.import_runs USING btree (dealer_id, status, started_at DESC);

alter table public.import_runs enable row level security;

alter table public.import_runs force row level security;

grant select, insert, update, delete on public.import_runs to authenticated, service_role;

create table if not exists public.import_items (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  dealer_id uuid not null,
  source_id uuid not null,
  raw_hash text,
  normalized_key text,
  payload_json jsonb default '{}'::jsonb not null,
  mapped_json jsonb default '{}'::jsonb not null,
  status public.import_item_status_t not null,
  vehicle_id uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_items_created_by_fkey' and conrelid = 'public.import_items'::regclass) then
    alter table public.import_items add constraint import_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_items_dealer_id_fkey' and conrelid = 'public.import_items'::regclass) then
    alter table public.import_items add constraint import_items_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_items_deleted_by_fkey' and conrelid = 'public.import_items'::regclass) then
    alter table public.import_items add constraint import_items_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_items_pkey' and conrelid = 'public.import_items'::regclass) then
    alter table public.import_items add constraint import_items_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_items_run_id_fkey' and conrelid = 'public.import_items'::regclass) then
    alter table public.import_items add constraint import_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES import_runs(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_items_source_id_fkey' and conrelid = 'public.import_items'::regclass) then
    alter table public.import_items add constraint import_items_source_id_fkey FOREIGN KEY (source_id) REFERENCES import_sources(id) ON DELETE RESTRICT;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_items_updated_by_fkey' and conrelid = 'public.import_items'::regclass) then
    alter table public.import_items add constraint import_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_items_vehicle_id_fkey' and conrelid = 'public.import_items'::regclass) then
    alter table public.import_items add constraint import_items_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
  end if;
end $$;

create index if not exists import_items_dealer_source_status_idx ON public.import_items USING btree (dealer_id, source_id, status);

create index if not exists import_items_run_status_idx ON public.import_items USING btree (run_id, status);

alter table public.import_items enable row level security;

alter table public.import_items force row level security;

grant select, insert, update, delete on public.import_items to authenticated, service_role;

create table if not exists public.import_errors (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  item_id uuid,
  dealer_id uuid not null,
  error_code text,
  error_message text not null,
  details_json jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  created_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_errors_created_by_fkey' and conrelid = 'public.import_errors'::regclass) then
    alter table public.import_errors add constraint import_errors_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_errors_dealer_id_fkey' and conrelid = 'public.import_errors'::regclass) then
    alter table public.import_errors add constraint import_errors_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_errors_deleted_by_fkey' and conrelid = 'public.import_errors'::regclass) then
    alter table public.import_errors add constraint import_errors_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_errors_item_id_fkey' and conrelid = 'public.import_errors'::regclass) then
    alter table public.import_errors add constraint import_errors_item_id_fkey FOREIGN KEY (item_id) REFERENCES import_items(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_errors_pkey' and conrelid = 'public.import_errors'::regclass) then
    alter table public.import_errors add constraint import_errors_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_errors_run_id_fkey' and conrelid = 'public.import_errors'::regclass) then
    alter table public.import_errors add constraint import_errors_run_id_fkey FOREIGN KEY (run_id) REFERENCES import_runs(id) ON DELETE CASCADE;
  end if;
end $$;

create index if not exists import_errors_dealer_created_desc_idx ON public.import_errors USING btree (dealer_id, created_at DESC);

create index if not exists import_errors_run_id_idx ON public.import_errors USING btree (run_id);

alter table public.import_errors enable row level security;

alter table public.import_errors force row level security;

grant select, insert, update, delete on public.import_errors to authenticated, service_role;

create table if not exists public.import_dedup_keys (
  id uuid default gen_random_uuid() not null,
  dealer_id uuid not null,
  source_id uuid not null,
  dedup_key text not null,
  vehicle_id uuid,
  first_seen_at timestamptz default now() not null,
  last_seen_at timestamptz default now() not null,
  seen_count integer default 1 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_dedup_keys_created_by_fkey' and conrelid = 'public.import_dedup_keys'::regclass) then
    alter table public.import_dedup_keys add constraint import_dedup_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_dedup_keys_dealer_id_fkey' and conrelid = 'public.import_dedup_keys'::regclass) then
    alter table public.import_dedup_keys add constraint import_dedup_keys_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_dedup_keys_deleted_by_fkey' and conrelid = 'public.import_dedup_keys'::regclass) then
    alter table public.import_dedup_keys add constraint import_dedup_keys_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_dedup_keys_pkey' and conrelid = 'public.import_dedup_keys'::regclass) then
    alter table public.import_dedup_keys add constraint import_dedup_keys_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_dedup_keys_source_id_fkey' and conrelid = 'public.import_dedup_keys'::regclass) then
    alter table public.import_dedup_keys add constraint import_dedup_keys_source_id_fkey FOREIGN KEY (source_id) REFERENCES import_sources(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_dedup_keys_updated_by_fkey' and conrelid = 'public.import_dedup_keys'::regclass) then
    alter table public.import_dedup_keys add constraint import_dedup_keys_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'import_dedup_keys_vehicle_id_fkey' and conrelid = 'public.import_dedup_keys'::regclass) then
    alter table public.import_dedup_keys add constraint import_dedup_keys_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
  end if;
end $$;

create unique index if not exists import_dedup_keys_dealer_source_dedup_unique_idx ON public.import_dedup_keys USING btree (dealer_id, source_id, dedup_key);

create index if not exists import_dedup_keys_dealer_source_last_seen_desc_idx ON public.import_dedup_keys USING btree (dealer_id, source_id, last_seen_at DESC);

alter table public.import_dedup_keys enable row level security;

alter table public.import_dedup_keys force row level security;

grant select, insert, update, delete on public.import_dedup_keys to authenticated, service_role;

create table if not exists public.lead_activities (
  id uuid default gen_random_uuid() not null,
  dealer_id uuid not null,
  lead_id uuid not null,
  activity_type text not null,
  note text,
  metadata_json jsonb,
  created_at timestamptz default now() not null,
  created_by uuid
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lead_activities_activity_type_check' and conrelid = 'public.lead_activities'::regclass) then
    alter table public.lead_activities add constraint lead_activities_activity_type_check CHECK ((activity_type = ANY (ARRAY['lead_created'::text, 'status_changed'::text, 'note_added'::text])));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lead_activities_created_by_fkey' and conrelid = 'public.lead_activities'::regclass) then
    alter table public.lead_activities add constraint lead_activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lead_activities_dealer_id_fkey' and conrelid = 'public.lead_activities'::regclass) then
    alter table public.lead_activities add constraint lead_activities_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lead_activities_lead_id_fkey' and conrelid = 'public.lead_activities'::regclass) then
    alter table public.lead_activities add constraint lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lead_activities_pkey' and conrelid = 'public.lead_activities'::regclass) then
    alter table public.lead_activities add constraint lead_activities_pkey PRIMARY KEY (id);
  end if;
end $$;

create index if not exists lead_activities_dealer_lead_created_desc_idx ON public.lead_activities USING btree (dealer_id, lead_id, created_at DESC);

alter table public.lead_activities enable row level security;

alter table public.lead_activities force row level security;

grant select, insert, update, delete on public.lead_activities to authenticated, service_role;

commit;
