begin;

alter table public.dealers
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists website text,
  add column if not exists logo_url text,
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists linkedin_url text,
  add column if not exists phone text,
  add column if not exists vat_number text,
  add column if not exists legal_name text,
  add column if not exists opening_hours text;

commit;
