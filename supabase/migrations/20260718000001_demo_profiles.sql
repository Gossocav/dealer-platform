begin;

create table if not exists public.demo_profiles (
  code text primary key,
  name text not null,
  description text not null,
  duration_days integer not null default 7,
  enabled boolean not null default true,
  badge_label text,
  modules jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  included_services jsonb not null default '[]'::jsonb,
  main_features jsonb not null default '[]'::jsonb,
  marketing_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_profiles_enabled_sort_idx
  on public.demo_profiles (enabled, sort_order, code);

alter table public.demo_requests
  add column if not exists demo_profile_code text,
  add column if not exists demo_modules jsonb not null default '{}'::jsonb,
  add column if not exists demo_limits jsonb not null default '{}'::jsonb;

insert into public.demo_profiles (
  code,
  name,
  description,
  duration_days,
  enabled,
  badge_label,
  modules,
  limits,
  included_services,
  main_features,
  marketing_note,
  sort_order,
  created_at,
  updated_at
)
values (
  'elite',
  'Demo Elite',
  'Profilo dimostrativo completo dedicato alle concessionarie che desiderano valutare sia la piattaforma Dealer Platform sia i servizi di marketing digitale.',
  7,
  true,
  'Soluzione Completa',
  jsonb_build_object(
    'dashboard', true,
    'vehicles', true,
    'leads', true,
    'clients', true,
    'calendar', true,
    'notifications', true,
    'dealership_profile', true,
    'reports', true,
    'analytics', true,
    'documents', true,
    'bulk_import', true,
    'marketplace_publish', true,
    'email_sending', false,
    'user_management', true,
    'roles_permissions', true,
    'billing', false,
    'advanced_settings', true,
    'api_integrations', true,
    'admin', false,
    'data_export', true,
    'registration', false,
    'social_marketing', true,
    'google_ads', true,
    'marketing_dashboard', true
  ),
  jsonb_build_object(
    'max_users', 10,
    'max_vehicles', 9999,
    'max_leads', 9999,
    'max_clients', 9999,
    'max_appointments', 9999,
    'max_storage_mb', 5000,
    'can_send_email', true,
    'can_publish_marketplace', true,
    'can_export_data', true,
    'can_create_users', true,
    'can_use_bulk_import', true
  ),
  jsonb_build_array(
    'Software Dealer Platform completo',
    'Visibilita sui social ufficiali Dealer Platform',
    'Campagna Google Ads dedicata ogni mese',
    'Report mensile della campagna',
    'Gestione professionale della campagna Google'
  ),
  jsonb_build_array(
    'Software Dealer Platform completo',
    'Marketing Digitale',
    'Google Ads',
    'Social Media'
  ),
  'La gestione della campagna Google Ads e inclusa. Il budget pubblicitario viene concordato e sostenuto direttamente dal cliente.',
  30,
  now(),
  now()
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  duration_days = excluded.duration_days,
  enabled = excluded.enabled,
  badge_label = excluded.badge_label,
  modules = excluded.modules,
  limits = excluded.limits,
  included_services = excluded.included_services,
  main_features = excluded.main_features,
  marketing_note = excluded.marketing_note,
  sort_order = excluded.sort_order,
  updated_at = now();

commit;
