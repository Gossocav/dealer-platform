-- DEALER PLATFORM - BASELINE SCHEMA
-- Core tables aligned with current registration model.

create extension if not exists "pgcrypto";

create table if not exists public.dealers (
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
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  dealer_id uuid references public.dealers(id) on delete set null,
  full_name text,
  role text not null default 'seller',
  status text not null default 'active',
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  dealership_name text not null,
  company_name text,
  contact_name text not null,
  email text not null,
  phone text,
  city text,
  vehicle_count integer,
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
