begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  dealer_id uuid references public.dealers(id) on delete set null,
  contact_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_name text;
  v_company_name text;
  v_vat_number text;
  v_fiscal_code text;
  v_phone text;
  v_contact_name text;
  v_dealer_id uuid;
begin
  v_dealer_name := nullif(trim(coalesce(new.raw_user_meta_data->>'dealer_name', '')), '');
  v_company_name := nullif(trim(coalesce(new.raw_user_meta_data->>'company_name', '')), '');
  v_vat_number := nullif(trim(coalesce(new.raw_user_meta_data->>'vat_number', '')), '');
  v_fiscal_code := nullif(trim(coalesce(new.raw_user_meta_data->>'fiscal_code', '')), '');
  v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  v_contact_name := nullif(trim(coalesce(new.raw_user_meta_data->>'contact_name', '')), '');

  if v_dealer_name is null or v_company_name is null or v_vat_number is null or v_fiscal_code is null then
    raise exception 'Metadati registrazione incompleti.' using errcode = '23502';
  end if;

  insert into public.dealers (
    name,
    legal_name,
    vat_number,
    fiscal_code,
    email,
    phone,
    status
  ) values (
    v_dealer_name,
    v_company_name,
    v_vat_number,
    v_fiscal_code,
    new.email,
    v_phone,
    'active'
  )
  returning id into v_dealer_id;

  insert into public.profiles (
    id,
    dealer_id,
    contact_name,
    email,
    phone
  ) values (
    new.id,
    v_dealer_id,
    v_contact_name,
    new.email,
    v_phone
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

grant select, update on public.profiles to authenticated;

commit;