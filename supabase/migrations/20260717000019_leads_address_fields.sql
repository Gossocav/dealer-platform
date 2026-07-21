begin;

-- The public lead form never asked for address/city/province/CAP, so customers
-- auto-created by link_or_create_customer_for_lead (20260717000018) always got
-- those fields empty. Adds the same columns already present on public.customers
-- to public.leads (additive, same style as 20260628_add_source_to_leads.sql),
-- then updates the trigger function to copy them onto a newly created customer.
-- When an existing customer is matched instead, their record is left untouched
-- so a later, possibly-blank inquiry can't overwrite good existing data.
alter table public.leads add column if not exists address text;
alter table public.leads add column if not exists city text;
alter table public.leads add column if not exists province text;
alter table public.leads add column if not exists zip_code text;

create or replace function public.link_or_create_customer_for_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_first_name text := nullif(btrim(coalesce(new.first_name, '')), '');
  v_last_name text := nullif(btrim(coalesce(new.last_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(new.email, ''))), '');
  v_phone text := nullif(btrim(coalesce(new.phone, '')), '');
  v_address text := nullif(btrim(coalesce(new.address, '')), '');
  v_city text := nullif(btrim(coalesce(new.city, '')), '');
  v_province text := nullif(btrim(coalesce(new.province, '')), '');
  v_zip_code text := nullif(btrim(coalesce(new.zip_code, '')), '');
begin
  if new.customer_id is not null then
    return new;
  end if;

  if v_email is null and v_phone is null then
    return new;
  end if;

  select id
  into v_customer_id
  from public.customers
  where dealer_id = new.dealer_id
    and (
      (v_email is not null and lower(email) = v_email)
      or (v_phone is not null and phone = v_phone)
    )
  order by created_at asc
  limit 1;

  if v_customer_id is null then
    perform set_config('app.trusted_customer_insert', 'true', true);

    insert into public.customers (dealer_id, first_name, last_name, email, phone, address, city, province, zip_code)
    values (new.dealer_id, v_first_name, v_last_name, v_email, v_phone, v_address, v_city, v_province, v_zip_code)
    returning id into v_customer_id;
  end if;

  new.customer_id := v_customer_id;
  return new;
end;
$$;

commit;
