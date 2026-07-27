begin;

-- The homepage showcase ("Ogni auto, radiografata") rotates among Elite
-- dealers. That page is public and queries with the anon key, but
-- dealer_demo_subscriptions is service_role-only (20260717000014), so the
-- plan cannot be read from there directly.
--
-- This exposes the single fact the marketplace needs -- which dealers are on
-- Elite -- without opening the subscriptions table. It returns ids only: no
-- plan history, no snapshots, no dates.
create or replace function public.elite_showcase_dealer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct s.dealer_id
  from public.dealer_demo_subscriptions s
  join public.dealers d on d.id = s.dealer_id
  where
    -- converted_plan_code is set only once a demo actually converts to a paid
    -- plan, so a dealer still trialling on the elite profile is excluded --
    -- the showcase is a benefit of the paid plan, not of the trial.
    lower(btrim(coalesce(s.converted_plan_code, ''))) = 'elite'
    and lower(coalesce(d.account_type, '')) <> 'demo'
    -- Same dealer visibility rule the marketplace applies everywhere else.
    and lower(coalesce(d.status, '')) in ('approved', 'active')
$$;

revoke all on function public.elite_showcase_dealer_ids() from public;
grant execute on function public.elite_showcase_dealer_ids() to anon, authenticated, service_role;

commit;
