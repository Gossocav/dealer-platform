begin;

-- Enforce the per-plan cap on active listings: base 50, pro 150, elite 300,
-- demo 10. Until now these numbers were declared (plan pages, plan matrix,
-- FAQ) but nothing counted a dealer's listings against them.
--
-- Deliberate behaviour for dealers already over their cap: nothing is taken
-- offline. The trigger only guards writes that newly publish a vehicle, so
-- existing listings stay live and editable, and the dealer simply cannot
-- publish more until they drop back under the cap.

-- 1) Resolve the active-listing cap for a dealer.
--
--    Returns null when the cap cannot be determined (unknown dealer, unknown
--    plan code). Null means "do not block": failing open is the safer mode
--    here, since a wrong lookup must never stop a paying dealer from
--    publishing.
create or replace function public.resolve_dealer_listing_cap(p_dealer_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_account_type text;
  v_legacy_plan text;
  v_plan text;
  v_cap integer;
begin
  if p_dealer_id is null then
    return null;
  end if;

  select lower(coalesce(d.account_type, '')), lower(coalesce(d.subscription_plan, ''))
  into v_account_type, v_legacy_plan
  from public.dealers d
  where d.id = p_dealer_id;

  if not found then
    return null;
  end if;

  -- Trial accounts get the demo allowance, which the FAQ states as 10.
  -- The dealer UI enforces this too, counting every vehicle rather than only
  -- the published ones, so the app check is the stricter of the two.
  if v_account_type = 'demo' then
    return 10;
  end if;

  -- dealers.subscription_plan is a legacy base/pro-only column never touched
  -- by the demo conversion flow; the subscription row is the only record of
  -- the plan actually in force, so it wins.
  select lower(coalesce(nullif(btrim(s.converted_plan_code), ''), nullif(btrim(s.demo_profile_code), ''), ''))
  into v_plan
  from public.dealer_demo_subscriptions s
  where s.dealer_id = p_dealer_id
  limit 1;

  v_plan := coalesce(nullif(v_plan, ''), nullif(v_legacy_plan, ''));

  if v_plan is null then
    return null;
  end if;

  select (m.limits_snapshot->>'max_vehicles')::integer
  into v_cap
  from public.demo_profile_snapshots(v_plan) m;

  return v_cap;
end;
$$;

-- 2) Block publishing past the cap.
create or replace function public.enforce_dealer_listing_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_active bigint;
begin
  -- Only a live listing consumes a slot. This mirrors the marketplace's own
  -- definition (isMarketplaceVehiclePublishable): both flags must agree, so a
  -- sold or reserved row does not count even if published is still true.
  if not (coalesce(new.published, false) and lower(coalesce(new.status, '')) = 'published') then
    return new;
  end if;

  -- Editing a vehicle that is already live consumes nothing new, which is
  -- what keeps dealers over their cap able to work on what they have.
  if tg_op = 'UPDATE'
     and coalesce(old.published, false)
     and lower(coalesce(old.status, '')) = 'published' then
    return new;
  end if;

  v_cap := public.resolve_dealer_listing_cap(new.dealer_id);

  if v_cap is null then
    return new;
  end if;

  select count(*)
  into v_active
  from public.vehicles v
  where v.dealer_id = new.dealer_id
    and coalesce(v.published, false)
    and lower(coalesce(v.status, '')) = 'published'
    and v.id is distinct from new.id;

  if v_active >= v_cap then
    raise exception
      'Hai raggiunto il limite di % annunci pubblicati previsto dal tuo piano. Metti in bozza un altro veicolo per pubblicarne uno nuovo.', v_cap
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Named so it fires after trg_enforce_vehicle_dealer_id: triggers of the same
-- timing run in alphabetical order, and that one assigns new.dealer_id on
-- insert, which this check depends on.
drop trigger if exists trg_vehicles_listing_limit on public.vehicles;
create trigger trg_vehicles_listing_limit
before insert or update on public.vehicles
for each row
execute function public.enforce_dealer_listing_limit();

-- 3) Report dealers already over their cap. They are left untouched on
--    purpose; this only surfaces how many there are.
do $$
declare
  v_over_limit bigint;
begin
  select count(*)
  into v_over_limit
  from (
    select v.dealer_id, count(*) as active_count
    from public.vehicles v
    where coalesce(v.published, false)
      and lower(coalesce(v.status, '')) = 'published'
    group by v.dealer_id
  ) per_dealer
  where per_dealer.active_count > coalesce(public.resolve_dealer_listing_cap(per_dealer.dealer_id), per_dealer.active_count);

  if v_over_limit > 0 then
    raise notice 'ATTENZIONE: % concessionarie hanno gia piu annunci pubblicati del loro tetto. Restano online; non potranno pubblicarne altri finche non rientrano.', v_over_limit;
  end if;
end
$$;

commit;
