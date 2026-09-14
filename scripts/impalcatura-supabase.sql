-- Quello che Supabase mette **prima** delle nostre migration.
--
-- Su un Postgres vuoto queste cose non ci sono, e senza di esse le migration
-- si fermano alla prima riga che nomina `auth.uid()` o `storage.buckets`.
-- Serve a ricostruire lo schema da zero per confrontarlo con la produzione.
--
-- Non e' una copia fedele di Supabase: e' il minimo che le nostre migration
-- pretendono. Non c'e' pgcrypto: nessuna migration lo usa (gen_random_uuid e'
-- nel Postgres di base) e in produzione le sue funzioni non stanno in public. Se un giorno una migration usasse qualcosa di nuovo di Supabase,
-- la ricostruzione fallirebbe qui, ed e' il posto giusto dove aggiungerlo.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create role supabase_storage_admin nologin;
create role authenticator noinherit login password 'impalcatura';
grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
grant usage on schema public, auth, storage to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  created_at timestamptz default now()
);

create table storage.buckets (
  id text primary key,
  name text,
  owner uuid,
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb
);

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

-- **Niente permessi predefiniti.** Supabase concede da se' ad anon,
-- authenticated e service_role tutti i permessi su ogni tabella nuova. Qui
-- non si copia niente di tutto questo, di proposito: se l'impalcatura li
-- regalasse, il confronto con la produzione non vedrebbe mai un permesso di
-- troppo -- ed e' esattamente quello che deve trovare. I permessi li danno
-- le migration, uno per uno, anche al ruolo di servizio
-- (20260910180000_permessi_solo_quelli_usati.sql).
