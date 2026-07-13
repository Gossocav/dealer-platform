begin;

-- Bootstrap core schema required before the first historical migration.
-- Guard behavior:
-- - if dealers/vehicles/vehicle_images/leads/profiles all exist: no-op
-- - if only a subset exists: fail hard (avoid hybrid bootstrap)
-- - if none exists: create full core baseline

do $bootstrap$
declare
  has_dealers boolean := to_regclass('public.dealers') is not null;
  has_vehicles boolean := to_regclass('public.vehicles') is not null;
  has_vehicle_images boolean := to_regclass('public.vehicle_images') is not null;
  has_leads boolean := to_regclass('public.leads') is not null;
  has_profiles boolean := to_regclass('public.profiles') is not null;
begin
  if has_dealers and has_vehicles and has_vehicle_images and has_leads and has_profiles then
    raise notice 'Core schema already present (dealers, vehicles, vehicle_images, leads, profiles). Baseline bootstrap skipped.';
    return;
  end if;

  if has_dealers or has_vehicles or has_vehicle_images or has_leads or has_profiles then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Partial core schema detected: dealers=%s vehicles=%s vehicle_images=%s leads=%s profiles=%s. Aborting bootstrap to avoid hybrid schema.',
        has_dealers,
        has_vehicles,
        has_vehicle_images,
        has_leads,
        has_profiles
      );
  end if;

  execute 'create extension if not exists "pgcrypto"';

  execute $sql$
    create table public.dealers (
      id uuid primary key default gen_random_uuid(),
      user_id uuid,
      name text not null,
      legal_name text,
      vat_number text,
      contact_person text,
      email text,
      phone text,
      whatsapp_phone text,
      address text,
      city text,
      province text,
      zip_code text,
      website text,
      logo_url text,
      description text,
      status text default 'active',
      plan text default 'starter',
      subscription_plan text default 'base',
      subscription_status text default 'pending_activation',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )
  $sql$;

  execute $sql$
    create table public.vehicles (
      id uuid primary key default gen_random_uuid(),
      dealer_id uuid not null references public.dealers(id) on delete cascade,
      brand text,
      model text,
      version text,
      year integer,
      mileage integer,
      price numeric,
      fuel text,
      transmission text,
      color text,
      vin text,
      body_type text,
      engine_size text,
      power_cv integer,
      doors integer,
      seats integer,
      warranty text,
      availability text,
      emission_class text,
      city text,
      province text,
      description text,
      status text default 'draft',
      published boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $sql$;

  execute 'create index vehicles_dealer_id_idx on public.vehicles (dealer_id)';
  execute 'create index vehicles_status_idx on public.vehicles (status)';
  execute 'create index vehicles_published_idx on public.vehicles (published)';

  execute $sql$
    create table public.vehicle_images (
      id uuid primary key default gen_random_uuid(),
      vehicle_id uuid not null references public.vehicles(id) on delete cascade,
      dealer_id uuid not null references public.dealers(id) on delete cascade,
      image_url text not null,
      position integer,
      is_cover boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint vehicle_images_position_non_negative check (position is null or position >= 0)
    )
  $sql$;

  -- Leads must already expose the columns defined by the historical
  -- create_leads migration because that migration uses CREATE TABLE IF NOT EXISTS.
  execute $sql$
    create table public.leads (
      id uuid primary key default gen_random_uuid(),
      dealer_id uuid not null references public.dealers(id) on delete cascade,
      vehicle_id uuid not null references public.vehicles(id) on delete cascade,
      first_name text,
      last_name text,
      email text,
      phone text,
      message text,
      status text not null default 'created' check (status in ('created', 'contacted', 'appointment', 'negotiation', 'won', 'lost')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $sql$;

  -- Profiles must already expose the columns defined by the historical
  -- create_profiles migration because that migration also uses CREATE TABLE IF NOT EXISTS.
  execute $sql$
    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      dealer_id uuid references public.dealers(id) on delete set null,
      full_name text,
      role text not null default 'seller',
      status text not null default 'active',
      preferences jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $sql$;

  execute 'create index vehicle_images_vehicle_id_idx on public.vehicle_images (vehicle_id)';
  execute 'create index vehicle_images_dealer_id_idx on public.vehicle_images (dealer_id)';
  execute 'create index vehicle_images_cover_idx on public.vehicle_images (vehicle_id, is_cover)';

  -- Placeholder resolver required by early migrations.
  execute $sql$
    create function public.current_dealer_id()
    returns uuid
    language sql
    stable
    security definer
    set search_path = public
    as $fn$
      select null::uuid
    $fn$
  $sql$;

  execute 'revoke all on function public.current_dealer_id() from public';
  execute 'grant execute on function public.current_dealer_id() to authenticated';
end
$bootstrap$;

commit;
