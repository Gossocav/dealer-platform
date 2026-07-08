-- Persist dealer subscription selection chosen during registration.

alter table if exists public.dealers
  add column if not exists subscription_plan text;

alter table if exists public.dealers
  add column if not exists subscription_status text;

update public.dealers
set subscription_plan = case
  when lower(coalesce(subscription_plan, '')) in ('base', 'pro') then lower(subscription_plan)
  when lower(coalesce(plan, '')) in ('pro', 'professional') then 'pro'
  else 'base'
end
where subscription_plan is null
   or lower(coalesce(subscription_plan, '')) not in ('base', 'pro');

update public.dealers
set subscription_status = 'pending_activation'
where subscription_status is null
   or btrim(subscription_status) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dealers_subscription_plan_check'
  ) then
    alter table public.dealers
      add constraint dealers_subscription_plan_check
      check (subscription_plan in ('base', 'pro'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'dealers_subscription_status_check'
  ) then
    alter table public.dealers
      add constraint dealers_subscription_status_check
      check (subscription_status in ('pending_activation', 'pending_payment', 'active', 'cancelled'));
  end if;
end $$;
