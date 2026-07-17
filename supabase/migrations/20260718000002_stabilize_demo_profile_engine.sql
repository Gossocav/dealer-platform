begin;

alter table public.demo_profiles
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists price_monthly numeric(10, 2),
  add column if not exists marketing_services jsonb not null default '{}'::jsonb;

create unique index if not exists demo_profiles_id_uidx
  on public.demo_profiles (id);

alter table public.demo_requests
  add column if not exists demo_profile_id uuid,
  add column if not exists demo_profile_price_monthly numeric(10, 2),
  add column if not exists demo_duration_days integer,
  add column if not exists demo_marketing_services jsonb not null default '{}'::jsonb,
  add column if not exists assigned_marketing_manager text,
  add column if not exists demo_status text not null default 'not_configured',
  add column if not exists updated_at timestamptz not null default now();

alter table public.demo_requests
  alter column demo_status set default 'not_configured';

update public.demo_requests
set demo_status = 'not_configured'
where demo_status is null;

alter table public.demo_requests
  alter column demo_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'demo_requests_demo_profile_id_fkey'
      and conrelid = 'public.demo_requests'::regclass
  ) then
    alter table public.demo_requests
      add constraint demo_requests_demo_profile_id_fkey
      foreign key (demo_profile_id) references public.demo_profiles(id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'demo_requests_demo_profile_code_check'
      and conrelid = 'public.demo_requests'::regclass
  ) then
    alter table public.demo_requests
      add constraint demo_requests_demo_profile_code_check
      check (demo_profile_code is null or demo_profile_code in ('base', 'pro', 'elite'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'demo_requests_demo_status_check'
      and conrelid = 'public.demo_requests'::regclass
  ) then
    alter table public.demo_requests
      add constraint demo_requests_demo_status_check
      check (demo_status in ('not_configured', 'configured', 'ready_for_activation', 'active', 'expired', 'suspended'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'demo_requests_demo_duration_days_check'
      and conrelid = 'public.demo_requests'::regclass
  ) then
    alter table public.demo_requests
      add constraint demo_requests_demo_duration_days_check
      check (demo_duration_days is null or demo_duration_days between 1 and 30)
      not valid;
  end if;
end
$$;

create index if not exists demo_requests_demo_profile_id_idx
  on public.demo_requests (demo_profile_id);

create index if not exists demo_requests_demo_status_idx
  on public.demo_requests (demo_status, updated_at desc);

insert into public.demo_profiles (
  code, name, description, price_monthly, duration_days, modules, limits,
  marketing_services, enabled, badge_label, main_features, included_services,
  marketing_note, sort_order, updated_at
)
values
  (
    'base', 'Dealer Platform Base',
    'Soluzione essenziale per verificare il flusso operativo base della concessionaria.',
    null, 7,
    '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":false,"documents":true,"bulk_import":false,"marketplace_publish":true,"email_sending":false,"user_management":false,"roles_permissions":false,"billing":false,"advanced_settings":false,"api_integrations":false,"admin":false,"data_export":false,"registration":false,"social_marketing":false,"google_ads":false,"marketing_dashboard":false}'::jsonb,
    '{"max_users":2,"max_vehicles":250,"max_leads":500,"max_clients":500,"max_appointments":500,"max_storage_mb":750,"can_send_email":false,"can_publish_marketplace":true,"can_export_data":false,"can_create_users":false,"can_use_bulk_import":false}'::jsonb,
    '{"social_visibility":false,"google_ads_management":false,"monthly_marketing_report":false,"meta_ads_management":false,"dedicated_landing_page":false,"local_seo":false}'::jsonb,
    true, null,
    '["Dashboard","Veicoli","Lead","Marketplace publish"]'::jsonb,
    '["Accesso alla piattaforma","Supporto operativo","Pubblicazione veicoli"]'::jsonb,
    null, 10, now()
  ),
  (
    'pro', 'Dealer Platform Pro',
    'Soluzione evoluta per concessionarie con volumi maggiori e processi più strutturati.',
    null, 7,
    '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":true,"documents":true,"bulk_import":true,"marketplace_publish":true,"email_sending":false,"user_management":true,"roles_permissions":true,"billing":false,"advanced_settings":true,"api_integrations":true,"admin":false,"data_export":true,"registration":false,"social_marketing":false,"google_ads":false,"marketing_dashboard":false}'::jsonb,
    '{"max_users":5,"max_vehicles":2500,"max_leads":2500,"max_clients":2500,"max_appointments":2500,"max_storage_mb":2500,"can_send_email":false,"can_publish_marketplace":true,"can_export_data":true,"can_create_users":true,"can_use_bulk_import":true}'::jsonb,
    '{"social_visibility":false,"google_ads_management":false,"monthly_marketing_report":false,"meta_ads_management":false,"dedicated_landing_page":false,"local_seo":false}'::jsonb,
    true, null,
    '["CRM lead avanzato","Statistiche e KPI","Import massivo","Esportazione dati"]'::jsonb,
    '["Accesso alla piattaforma","Funzioni avanzate","Supporto prioritario"]'::jsonb,
    null, 20, now()
  ),
  (
    'elite', 'Dealer Platform Elite',
    'Soluzione completa con piattaforma Dealer Platform e servizi di visibilità e promozione online.',
    699, 7,
    '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":true,"documents":true,"bulk_import":true,"marketplace_publish":true,"email_sending":false,"user_management":true,"roles_permissions":true,"billing":false,"advanced_settings":true,"api_integrations":true,"admin":false,"data_export":true,"registration":false,"social_marketing":true,"google_ads":true,"marketing_dashboard":true}'::jsonb,
    '{"max_users":10,"max_vehicles":9999,"max_leads":9999,"max_clients":9999,"max_appointments":9999,"max_storage_mb":5000,"can_send_email":false,"can_publish_marketplace":true,"can_export_data":true,"can_create_users":true,"can_use_bulk_import":true}'::jsonb,
    '{"social_visibility":true,"google_ads_management":true,"monthly_marketing_report":true,"meta_ads_management":false,"dedicated_landing_page":false,"local_seo":false}'::jsonb,
    true, 'Soluzione completa',
    '["Software Dealer Platform completo","Visibilità social","Gestione Google Ads","Report mensile"]'::jsonb,
    '["Software Dealer Platform completo","Visibilità sui social ufficiali Dealer Platform","Gestione Google Ads","Report mensile delle performance marketing"]'::jsonb,
    'La gestione della campagna Google Ads è inclusa. Il budget pubblicitario non è incluso nel canone di € 699/mese, viene concordato con il cliente ed è sostenuto direttamente dal cliente.',
    30, now()
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  price_monthly = excluded.price_monthly,
  duration_days = excluded.duration_days,
  modules = excluded.modules,
  limits = excluded.limits,
  marketing_services = excluded.marketing_services,
  enabled = excluded.enabled,
  badge_label = excluded.badge_label,
  main_features = excluded.main_features,
  included_services = excluded.included_services,
  marketing_note = excluded.marketing_note,
  sort_order = excluded.sort_order,
  updated_at = now();

commit;
