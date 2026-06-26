-- DEALER PLATFORM - DATABASE SCHEMA MVP
-- Versione 1.0

create extension if not exists "pgcrypto";

create table dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  vat_number text,
  fiscal_code text,
  email text,
  phone text,
  website text,
  logo_url text,
  status text default 'active',
  plan text default 'starter',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
