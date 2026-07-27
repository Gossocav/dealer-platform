begin;

-- Align the per-plan listing cap with what the plan pages advertise:
-- base 50, pro 150, elite 300 active vehicle listings.
--
-- Previously max_vehicles was 250 / 2500 / 9999 while the pages promised
-- "annunci illimitati" on pro and elite, so neither number matched the offer.
--
-- As in 20260727000000_single_user_per_plan.sql, snapshots already issued to
-- dealers are deliberately left untouched: they are frozen by
-- trg_protect_dealer_demo_subscription_snapshot and record the terms each
-- dealer was configured under. Only new configurations pick up these values.
--
-- NOTE: max_vehicles is still not enforced anywhere in code -- nothing counts
-- a dealer's listings against it. This migration makes the declared number
-- correct; enforcing it is separate work.
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
      when 'pro' then '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":true,"documents":true,"bulk_import":true,"marketplace_publish":true,"email_sending":false,"user_management":false,"roles_permissions":false,"billing":false,"advanced_settings":true,"api_integrations":true,"admin":false,"data_export":true,"registration":false,"social_marketing":false,"google_ads":false,"marketing_dashboard":false}'::jsonb
      when 'elite' then '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":true,"documents":true,"bulk_import":true,"marketplace_publish":true,"email_sending":true,"user_management":false,"roles_permissions":false,"billing":false,"advanced_settings":true,"api_integrations":true,"admin":false,"data_export":true,"registration":false,"social_marketing":true,"google_ads":true,"marketing_dashboard":true}'::jsonb
      else null
    end,
    case code
      when 'base' then '{"max_users":1,"max_vehicles":50,"max_leads":500,"max_clients":500,"max_appointments":500,"max_storage_mb":750,"can_send_email":false,"can_publish_marketplace":true,"can_export_data":false,"can_create_users":false,"can_use_bulk_import":false}'::jsonb
      when 'pro' then '{"max_users":1,"max_vehicles":150,"max_leads":2500,"max_clients":2500,"max_appointments":2500,"max_storage_mb":2500,"can_send_email":false,"can_publish_marketplace":true,"can_export_data":true,"can_create_users":false,"can_use_bulk_import":true}'::jsonb
      when 'elite' then '{"max_users":1,"max_vehicles":300,"max_leads":9999,"max_clients":9999,"max_appointments":9999,"max_storage_mb":5000,"can_send_email":true,"can_publish_marketplace":true,"can_export_data":true,"can_create_users":false,"can_use_bulk_import":true}'::jsonb
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

commit;
