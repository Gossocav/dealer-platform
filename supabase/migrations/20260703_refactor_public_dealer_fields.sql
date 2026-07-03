begin;

alter table public.dealers
  add column if not exists whatsapp_phone text;

alter table public.profiles
  drop column if exists phone,
  drop column if exists email,
  drop column if exists contact_name;

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
  v_dealer_id uuid;
begin
  v_dealer_name := nullif(trim(coalesce(new.raw_user_meta_data->>'dealer_name', '')), '');
  v_company_name := nullif(trim(coalesce(new.raw_user_meta_data->>'company_name', '')), '');
  v_vat_number := nullif(trim(coalesce(new.raw_user_meta_data->>'vat_number', '')), '');
  v_fiscal_code := nullif(trim(coalesce(new.raw_user_meta_data->>'fiscal_code', '')), '');
  v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');

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
    dealer_id
  ) values (
    new.id,
    v_dealer_id
  )
  on conflict (id) do update set dealer_id = excluded.dealer_id;

  return new;
end;
$$;

commit;