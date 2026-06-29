begin;

create or replace function public.enforce_lead_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_dealer_id uuid;
begin
  select v.dealer_id
  into v_vehicle_dealer_id
  from public.vehicles v
  where v.id = new.vehicle_id
  limit 1;

  if v_vehicle_dealer_id is null then
    raise exception 'Veicolo non trovato o non accessibile.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.dealer_id is null then
      new.dealer_id := v_vehicle_dealer_id;
    elsif new.dealer_id <> v_vehicle_dealer_id then
      raise exception 'dealer_id non consentito per questo veicolo.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.dealer_id is distinct from old.dealer_id then
      raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

commit;
