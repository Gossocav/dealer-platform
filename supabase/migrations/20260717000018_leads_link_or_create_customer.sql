begin;

-- A lead never resulted in a customer record anywhere in the app (confirmed: no
-- application code inserts into public.customers, and no prior trigger did either).
-- Requested: a customer should be born the moment a lead comes in. Today the only
-- live insert path is the public marketplace API (src/app/api/marketplace/lead/route.ts,
-- anon role) -- src/app/veicoli/[id]/request-information-button.tsx exists but is never
-- imported/rendered anywhere, so it's dead code, not a second active path. Regardless,
-- customers_insert_own only grants to the `authenticated` role, so an app-level insert
-- from the anon marketplace path would fail RLS. A security definer trigger (matching
-- the enforce_* pattern already used throughout this schema) sidesteps that and covers
-- the live path plus any future insert path (including that button, if it's ever wired
-- up) uniformly, with no per-route logic to keep in sync.
--
-- Matches an existing customer for the same dealer by email or phone (whichever the
-- lead provided) before creating a new one, so repeat inquiries from the same person
-- link to one customer record instead of duplicating it.
--
-- leads_insert_own only requires dealer_id to match the lead's vehicle, not that the
-- caller IS that dealer -- an authenticated user from a different dealer can already
-- (by design) submit a lead on someone else's vehicle. enforce_customer_dealer_id on
-- public.customers rejects an insert whose dealer_id doesn't match current_dealer_id(),
-- which would wrongly abort that lead insert. A transaction-local flag lets this one
-- trusted trigger-driven insert bypass that identity check without weakening it for
-- any direct customer insert/update a dealer performs themselves.
create or replace function public.enforce_customer_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
  v_trusted boolean := coalesce(current_setting('app.trusted_customer_insert', true), 'false') = 'true';
begin
  v_dealer_id := public.current_dealer_id();

  if tg_op = 'INSERT' then
    if new.dealer_id is null then
      new.dealer_id := v_dealer_id;
    elsif new.dealer_id <> v_dealer_id and not v_trusted then
      raise exception 'dealer_id non consentito per questo utente.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.dealer_id is distinct from old.dealer_id then
    raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

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

    insert into public.customers (dealer_id, first_name, last_name, email, phone)
    values (new.dealer_id, v_first_name, v_last_name, v_email, v_phone)
    returning id into v_customer_id;
  end if;

  new.customer_id := v_customer_id;
  return new;
end;
$$;

drop trigger if exists trg_link_or_create_customer_for_lead on public.leads;
create trigger trg_link_or_create_customer_for_lead
before insert on public.leads
for each row
execute function public.link_or_create_customer_for_lead();

commit;
