begin;

-- Every plan (base, pro, elite) is limited to a single user.
--
-- Before this migration max_users was 2/5/10 per plan and was declared but
-- never enforced anywhere in code, so nothing stopped a dealer from adding
-- extra members. This migration makes the limit both correct and real:
--   1) the plan matrix returns max_users = 1 (and can_create_users = false),
--   2) already-issued limits snapshots are rewritten,
--   3) a trigger rejects a second active membership on dealer_users.

-- 1) Plan matrix: max_users = 1 and can_create_users = false for every plan.
--    Every other module/limit/marketing/email value is intentionally left
--    exactly as it was.
create or replace function public.demo_profile_snapshots(
  p_profile_code text
)
returns table(
  profile_code text,
  modules_snapshot jsonb,
  limits_snapshot jsonb,
  marketing_snapshot jsonb,
  email_policy jsonb
)
language sql
stable
set search_path = public
as $$
  with normalized as (
    select lower(coalesce(p_profile_code, '')) as code
  )
  select
    code,
    case code
      when 'base' then '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":false,"documents":true,"bulk_import":false,"marketplace_publish":true,"email_sending":false,"user_management":false,"roles_permissions":false,"billing":false,"advanced_settings":false,"api_integrations":false,"admin":false,"data_export":false,"registration":false,"social_marketing":false,"google_ads":false,"marketing_dashboard":false}'::jsonb
      when 'pro' then '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":true,"documents":true,"bulk_import":true,"marketplace_publish":true,"email_sending":false,"user_management":true,"roles_permissions":true,"billing":false,"advanced_settings":true,"api_integrations":true,"admin":false,"data_export":true,"registration":false,"social_marketing":false,"google_ads":false,"marketing_dashboard":false}'::jsonb
      when 'elite' then '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":true,"documents":true,"bulk_import":true,"marketplace_publish":true,"email_sending":true,"user_management":true,"roles_permissions":true,"billing":false,"advanced_settings":true,"api_integrations":true,"admin":false,"data_export":true,"registration":false,"social_marketing":true,"google_ads":true,"marketing_dashboard":true}'::jsonb
      else null
    end,
    case code
      when 'base' then '{"max_users":1,"max_vehicles":250,"max_leads":500,"max_clients":500,"max_appointments":500,"max_storage_mb":750,"can_send_email":false,"can_publish_marketplace":true,"can_export_data":false,"can_create_users":false,"can_use_bulk_import":false}'::jsonb
      when 'pro' then '{"max_users":1,"max_vehicles":2500,"max_leads":2500,"max_clients":2500,"max_appointments":2500,"max_storage_mb":2500,"can_send_email":false,"can_publish_marketplace":true,"can_export_data":true,"can_create_users":false,"can_use_bulk_import":true}'::jsonb
      when 'elite' then '{"max_users":1,"max_vehicles":9999,"max_leads":9999,"max_clients":9999,"max_appointments":9999,"max_storage_mb":5000,"can_send_email":true,"can_publish_marketplace":true,"can_export_data":true,"can_create_users":false,"can_use_bulk_import":true}'::jsonb
      else null
    end,
    case code
      when 'elite' then '{"social_visibility":true,"google_ads_management":true,"monthly_marketing_report":true,"meta_ads_management":false,"dedicated_landing_page":false,"local_seo":false}'::jsonb
      when 'base' then '{"social_visibility":false,"google_ads_management":false,"monthly_marketing_report":false,"meta_ads_management":false,"dedicated_landing_page":false,"local_seo":false}'::jsonb
      when 'pro' then '{"social_visibility":false,"google_ads_management":false,"monthly_marketing_report":false,"meta_ads_management":false,"dedicated_landing_page":false,"local_seo":false}'::jsonb
      else null
    end,
    case code
      when 'elite' then '{"email_sending":true,"can_send_email":true}'::jsonb
      when 'base' then '{"email_sending":false,"can_send_email":false}'::jsonb
      when 'pro' then '{"email_sending":false,"can_send_email":false}'::jsonb
      else null
    end
  from normalized
  where code in ('base', 'pro', 'elite')
$$;

-- 2) Rewrite limits already frozen onto existing subscriptions. Keys other
--    than max_users / can_create_users are preserved by the jsonb merge.
do $$
begin
  if to_regclass('public.dealer_demo_subscriptions') is not null then
    update public.dealer_demo_subscriptions
    set limits_snapshot = limits_snapshot || '{"max_users":1,"can_create_users":false}'::jsonb
    where limits_snapshot is not null
      and (
        limits_snapshot->>'max_users' is distinct from '1'
        or limits_snapshot->>'can_create_users' is distinct from 'false'
      );
  end if;
end
$$;

-- 3) Enforce the cap on writes. Runs after trg_enforce_dealer_user_membership
--    (alphabetical order: "dealer_user_..." < "single_...") so new.status is
--    already normalized to lower case by the time this fires.
create or replace function public.enforce_single_dealer_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count bigint;
begin
  -- Only an active membership consumes the single seat. Invited, suspended
  -- and disabled rows stay allowed so a seat can be handed over.
  if coalesce(new.status, '') <> 'active' then
    return new;
  end if;

  select count(*)
  into v_active_count
  from public.dealer_users du
  where du.dealer_id = new.dealer_id
    and du.status = 'active'
    and du.id is distinct from new.id;

  if v_active_count > 0 then
    raise exception 'Ogni piano consente un solo utente attivo per concessionaria.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_single_dealer_user on public.dealer_users;
create trigger trg_enforce_single_dealer_user
before insert or update on public.dealer_users
for each row
execute function public.enforce_single_dealer_user();

-- 4) Report pre-existing dealers over the cap. The trigger only guards new
--    writes, so legacy rows survive untouched and are surfaced here instead
--    of failing the migration.
do $$
declare
  v_over_limit bigint;
begin
  select count(*)
  into v_over_limit
  from (
    select dealer_id
    from public.dealer_users
    where status = 'active'
    group by dealer_id
    having count(*) > 1
  ) s;

  if v_over_limit > 0 then
    raise notice 'ATTENZIONE: % concessionarie hanno gia piu di un utente attivo. Il limite vale sui nuovi inserimenti; queste vanno sistemate a mano.', v_over_limit;
  end if;
end
$$;

commit;
