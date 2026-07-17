begin;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'import_source_type_t' and typnamespace = 'public'::regnamespace
  ) then
    create type public.import_source_type_t as enum ('csv', 'api', 'manual', 'feed');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'import_schedule_t' and typnamespace = 'public'::regnamespace
  ) then
    create type public.import_schedule_t as enum ('manual', 'daily', 'weekly', 'monthly');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'import_run_status_t' and typnamespace = 'public'::regnamespace
  ) then
    create type public.import_run_status_t as enum ('pending', 'running', 'completed', 'completed_with_errors', 'failed');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'import_item_status_t' and typnamespace = 'public'::regnamespace
  ) then
    create type public.import_item_status_t as enum ('pending', 'imported', 'updated', 'duplicate', 'error', 'skipped');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'audit_actor_type_t' and typnamespace = 'public'::regnamespace
  ) then
    create type public.audit_actor_type_t as enum ('user', 'system', 'api');
  end if;
end
$$;

create table if not exists public.import_sources (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  name text not null,
  source_type public.import_source_type_t not null,
  endpoint_url text,
  auth_type text,
  schedule_type public.import_schedule_t not null,
  active boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text
);

create table if not exists public.import_profiles (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  source_id uuid not null references public.import_sources(id) on delete cascade,
  name text not null,
  mapping_json jsonb not null default '{}'::jsonb,
  transform_json jsonb not null default '{}'::jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text
);

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  source_id uuid not null references public.import_sources(id) on delete restrict,
  import_profile_id uuid references public.import_profiles(id) on delete set null,
  status public.import_run_status_t not null,
  mode text not null,
  started_at timestamptz,
  finished_at timestamptz,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  updated_rows integer not null default 0,
  error_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text
);

create table if not exists public.import_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.import_runs(id) on delete cascade,
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  source_id uuid not null references public.import_sources(id) on delete restrict,
  raw_hash text,
  normalized_key text,
  payload_json jsonb not null default '{}'::jsonb,
  mapped_json jsonb not null default '{}'::jsonb,
  status public.import_item_status_t not null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text
);

create table if not exists public.import_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.import_runs(id) on delete cascade,
  item_id uuid references public.import_items(id) on delete set null,
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  error_code text,
  error_message text not null,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text
);

create table if not exists public.import_dedup_keys (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  source_id uuid not null references public.import_sources(id) on delete cascade,
  dedup_key text not null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text
);

create table if not exists public.storage_objects (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  bucket text not null,
  object_path text not null,
  public_url text,
  entity_type text,
  entity_id uuid,
  mime_type text,
  size_bytes bigint,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid references public.dealers(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_type public.audit_actor_type_t not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  metadata_json jsonb,
  request_id text,
  session_id text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists import_runs_dealer_source_started_desc_idx
on public.import_runs (dealer_id, source_id, started_at desc);

create index if not exists import_runs_dealer_status_started_desc_idx
on public.import_runs (dealer_id, status, started_at desc);

create index if not exists import_items_run_status_idx
on public.import_items (run_id, status);

create index if not exists import_items_dealer_source_status_idx
on public.import_items (dealer_id, source_id, status);

create index if not exists import_errors_run_id_idx
on public.import_errors (run_id);

create index if not exists import_errors_dealer_created_desc_idx
on public.import_errors (dealer_id, created_at desc);

create unique index if not exists import_dedup_keys_dealer_source_dedup_unique_idx
on public.import_dedup_keys (dealer_id, source_id, dedup_key);

create index if not exists import_dedup_keys_dealer_source_last_seen_desc_idx
on public.import_dedup_keys (dealer_id, source_id, last_seen_at desc);

create unique index if not exists storage_objects_bucket_object_path_unique_idx
on public.storage_objects (bucket, object_path)
where deleted_at is null;

create index if not exists storage_objects_dealer_created_desc_idx
on public.storage_objects (dealer_id, created_at desc);

create index if not exists storage_objects_dealer_entity_idx
on public.storage_objects (dealer_id, entity_type, entity_id);

create index if not exists audit_logs_dealer_created_desc_idx
on public.audit_logs (dealer_id, created_at desc);

create index if not exists audit_logs_entity_idx
on public.audit_logs (entity_type, entity_id);

create index if not exists audit_logs_request_id_idx
on public.audit_logs (request_id);

create index if not exists audit_logs_session_id_idx
on public.audit_logs (session_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_import_sources_set_updated_at on public.import_sources;
create trigger trg_import_sources_set_updated_at
before update on public.import_sources
for each row
execute function public.set_updated_at();

drop trigger if exists trg_import_profiles_set_updated_at on public.import_profiles;
create trigger trg_import_profiles_set_updated_at
before update on public.import_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_import_runs_set_updated_at on public.import_runs;
create trigger trg_import_runs_set_updated_at
before update on public.import_runs
for each row
execute function public.set_updated_at();

drop trigger if exists trg_import_items_set_updated_at on public.import_items;
create trigger trg_import_items_set_updated_at
before update on public.import_items
for each row
execute function public.set_updated_at();

drop trigger if exists trg_import_dedup_keys_set_updated_at on public.import_dedup_keys;
create trigger trg_import_dedup_keys_set_updated_at
before update on public.import_dedup_keys
for each row
execute function public.set_updated_at();

drop trigger if exists trg_storage_objects_set_updated_at on public.storage_objects;
create trigger trg_storage_objects_set_updated_at
before update on public.storage_objects
for each row
execute function public.set_updated_at();

commit;