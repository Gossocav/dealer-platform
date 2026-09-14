-- Ritorno di 20260910180000_permessi_solo_quelli_usati.sql: rimette, tabella
-- per tabella, esattamente i permessi che la produzione aveva il 10/09/2026
-- (fotografia letta con il controllo settimanale), compresi i permessi di
-- colonna. MAINTAIN esiste solo dalla versione 17 di Postgres: si rimette,
-- dove la produzione lo aveva, solo se il server lo conosce.
--
-- Costruito dall'inventario di produzione del 10/09/2026 mattina, prima di
-- ogni modifica. Da confermare riga per riga con la fotografia dei permessi
-- letta dall'editor SQL prima di usarlo.

begin;

-- appointments
revoke all on public.appointments from public, anon, authenticated, service_role;
grant all on public.appointments to authenticated;
grant all on public.appointments to service_role;

-- audit_logs
revoke all on public.audit_logs from public, anon, authenticated, service_role;
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

-- customers
revoke all on public.customers from public, anon, authenticated, service_role;
grant all on public.customers to authenticated;
grant all on public.customers to service_role;

-- dealer_demo_subscriptions
revoke all on public.dealer_demo_subscriptions from public, anon, authenticated, service_role;
grant all on public.dealer_demo_subscriptions to service_role;

-- dealer_email_templates
revoke all on public.dealer_email_templates from public, anon, authenticated, service_role;
grant all on public.dealer_email_templates to authenticated;
grant all on public.dealer_email_templates to service_role;

-- dealer_info_requests
revoke all on public.dealer_info_requests from public, anon, authenticated, service_role;
grant all on public.dealer_info_requests to service_role;

-- dealer_users
revoke all on public.dealer_users from public, anon, authenticated, service_role;
grant select on public.dealer_users to authenticated;
grant all on public.dealer_users to service_role;

-- dealers
revoke all on public.dealers from public, anon, authenticated, service_role;
grant insert, update, delete, truncate, references, trigger on public.dealers to anon;
grant select, insert, delete, truncate, references, trigger on public.dealers to authenticated;
grant all on public.dealers to service_role;
grant select (
  id, name, legal_name, vat_number, email, phone, whatsapp_phone, address, city, province, zip_code, website, logo_url, description, status, opening_hours, social_links, postal_code, facebook_url, instagram_url, linkedin_url, rental_url
) on public.dealers to anon;
grant update (
  name, legal_name, vat_number, contact_person, email, phone, whatsapp_phone, address, city, province, zip_code, postal_code, website, rental_url, logo_url, description, opening_hours, facebook_url, instagram_url, linkedin_url, social_links, updated_at
) on public.dealers to authenticated;

-- demo_requests
revoke all on public.demo_requests from public, anon, authenticated, service_role;
grant all on public.demo_requests to authenticated;
grant all on public.demo_requests to service_role;

-- email_attachments
revoke all on public.email_attachments from public, anon, authenticated, service_role;
grant all on public.email_attachments to authenticated;
grant all on public.email_attachments to service_role;

-- email_delivery_events
revoke all on public.email_delivery_events from public, anon, authenticated, service_role;
grant all on public.email_delivery_events to authenticated;
grant all on public.email_delivery_events to service_role;

-- email_messages
revoke all on public.email_messages from public, anon, authenticated, service_role;
grant all on public.email_messages to authenticated;
grant all on public.email_messages to service_role;

-- email_queue
revoke all on public.email_queue from public, anon, authenticated, service_role;
grant all on public.email_queue to authenticated;
grant all on public.email_queue to service_role;

-- email_threads
revoke all on public.email_threads from public, anon, authenticated, service_role;
grant all on public.email_threads to authenticated;
grant all on public.email_threads to service_role;

-- import_dedup_keys
revoke all on public.import_dedup_keys from public, anon, authenticated, service_role;
grant all on public.import_dedup_keys to authenticated;
grant all on public.import_dedup_keys to service_role;

-- import_errors
revoke all on public.import_errors from public, anon, authenticated, service_role;
grant all on public.import_errors to authenticated;
grant all on public.import_errors to service_role;

-- import_items
revoke all on public.import_items from public, anon, authenticated, service_role;
grant all on public.import_items to authenticated;
grant all on public.import_items to service_role;

-- import_profiles
revoke all on public.import_profiles from public, anon, authenticated, service_role;
grant all on public.import_profiles to authenticated;
grant all on public.import_profiles to service_role;

-- import_runs
revoke all on public.import_runs from public, anon, authenticated, service_role;
grant all on public.import_runs to authenticated;
grant all on public.import_runs to service_role;

-- import_sources
revoke all on public.import_sources from public, anon, authenticated, service_role;
grant all on public.import_sources to authenticated;
grant all on public.import_sources to service_role;

-- lead_activities
revoke all on public.lead_activities from public, anon, authenticated, service_role;
grant all on public.lead_activities to authenticated;
grant all on public.lead_activities to service_role;

-- leads
revoke all on public.leads from public, anon, authenticated, service_role;
grant all on public.leads to authenticated;
grant all on public.leads to service_role;

-- marketplace_views
revoke all on public.marketplace_views from public, anon, authenticated, service_role;
grant all on public.marketplace_views to service_role;

-- notifications
revoke all on public.notifications from public, anon, authenticated, service_role;
grant all on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- platform_email_templates
revoke all on public.platform_email_templates from public, anon, authenticated, service_role;
grant all on public.platform_email_templates to authenticated;
grant all on public.platform_email_templates to service_role;

-- profiles
revoke all on public.profiles from public, anon, authenticated, service_role;
grant select, insert, delete, truncate, references, trigger on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant update (
  full_name, preferences
) on public.profiles to authenticated;

-- promemoria
revoke all on public.promemoria from public, anon, authenticated, service_role;
grant all on public.promemoria to authenticated;
grant all on public.promemoria to service_role;

-- rate_limits
revoke all on public.rate_limits from public, anon, authenticated, service_role;
grant all on public.rate_limits to service_role;

-- vehicle_appraisals
revoke all on public.vehicle_appraisals from public, anon, authenticated, service_role;
grant all on public.vehicle_appraisals to authenticated;
grant all on public.vehicle_appraisals to service_role;

-- vehicle_documents
revoke all on public.vehicle_documents from public, anon, authenticated, service_role;
grant all on public.vehicle_documents to authenticated;
grant all on public.vehicle_documents to service_role;

-- vehicle_economics
revoke all on public.vehicle_economics from public, anon, authenticated, service_role;
grant all on public.vehicle_economics to authenticated;
grant all on public.vehicle_economics to service_role;

-- vehicle_images
revoke all on public.vehicle_images from public, anon, authenticated, service_role;
grant all on public.vehicle_images to anon;
grant all on public.vehicle_images to authenticated;
grant all on public.vehicle_images to service_role;

-- vehicle_sales
revoke all on public.vehicle_sales from public, anon, authenticated, service_role;
grant all on public.vehicle_sales to authenticated;
grant all on public.vehicle_sales to service_role;

-- vehicles
revoke all on public.vehicles from public, anon, authenticated, service_role;
grant insert, update, delete, truncate, references, trigger on public.vehicles to anon;
grant all on public.vehicles to authenticated;
grant all on public.vehicles to service_role;
grant select (
  id, dealer_id, brand, model, version, year, mileage, price, fuel, transmission, color, body_type, engine_size, power_cv, doors, seats, warranty, availability, emission_class, city, province, description, status, published, created_at, updated_at, equipment, interior_type, power_kw, registration_date, traction, vehicle_category, vehicle_condition, registration_month, vat_exposed, co2_emissions, previous_owners, video_url, ricerca_testo
) on public.vehicles to anon;

-- MAINTAIN, dove in produzione c'era tutto (65 coppie tabella/ruolo)
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'grant maintain on public.appointments to authenticated';
    execute 'grant maintain on public.appointments to service_role';
    execute 'grant maintain on public.audit_logs to service_role';
    execute 'grant maintain on public.customers to authenticated';
    execute 'grant maintain on public.customers to service_role';
    execute 'grant maintain on public.dealer_demo_subscriptions to service_role';
    execute 'grant maintain on public.dealer_email_templates to authenticated';
    execute 'grant maintain on public.dealer_email_templates to service_role';
    execute 'grant maintain on public.dealer_info_requests to service_role';
    execute 'grant maintain on public.dealer_users to service_role';
    execute 'grant maintain on public.dealers to anon';
    execute 'grant maintain on public.dealers to authenticated';
    execute 'grant maintain on public.dealers to service_role';
    execute 'grant maintain on public.demo_requests to authenticated';
    execute 'grant maintain on public.demo_requests to service_role';
    execute 'grant maintain on public.email_attachments to authenticated';
    execute 'grant maintain on public.email_attachments to service_role';
    execute 'grant maintain on public.email_delivery_events to authenticated';
    execute 'grant maintain on public.email_delivery_events to service_role';
    execute 'grant maintain on public.email_messages to authenticated';
    execute 'grant maintain on public.email_messages to service_role';
    execute 'grant maintain on public.email_queue to authenticated';
    execute 'grant maintain on public.email_queue to service_role';
    execute 'grant maintain on public.email_threads to authenticated';
    execute 'grant maintain on public.email_threads to service_role';
    execute 'grant maintain on public.import_dedup_keys to authenticated';
    execute 'grant maintain on public.import_dedup_keys to service_role';
    execute 'grant maintain on public.import_errors to authenticated';
    execute 'grant maintain on public.import_errors to service_role';
    execute 'grant maintain on public.import_items to authenticated';
    execute 'grant maintain on public.import_items to service_role';
    execute 'grant maintain on public.import_profiles to authenticated';
    execute 'grant maintain on public.import_profiles to service_role';
    execute 'grant maintain on public.import_runs to authenticated';
    execute 'grant maintain on public.import_runs to service_role';
    execute 'grant maintain on public.import_sources to authenticated';
    execute 'grant maintain on public.import_sources to service_role';
    execute 'grant maintain on public.lead_activities to authenticated';
    execute 'grant maintain on public.lead_activities to service_role';
    execute 'grant maintain on public.leads to authenticated';
    execute 'grant maintain on public.leads to service_role';
    execute 'grant maintain on public.marketplace_views to service_role';
    execute 'grant maintain on public.notifications to authenticated';
    execute 'grant maintain on public.notifications to service_role';
    execute 'grant maintain on public.platform_email_templates to authenticated';
    execute 'grant maintain on public.platform_email_templates to service_role';
    execute 'grant maintain on public.profiles to authenticated';
    execute 'grant maintain on public.profiles to service_role';
    execute 'grant maintain on public.promemoria to authenticated';
    execute 'grant maintain on public.promemoria to service_role';
    execute 'grant maintain on public.rate_limits to service_role';
    execute 'grant maintain on public.vehicle_appraisals to authenticated';
    execute 'grant maintain on public.vehicle_appraisals to service_role';
    execute 'grant maintain on public.vehicle_documents to authenticated';
    execute 'grant maintain on public.vehicle_documents to service_role';
    execute 'grant maintain on public.vehicle_economics to authenticated';
    execute 'grant maintain on public.vehicle_economics to service_role';
    execute 'grant maintain on public.vehicle_images to anon';
    execute 'grant maintain on public.vehicle_images to authenticated';
    execute 'grant maintain on public.vehicle_images to service_role';
    execute 'grant maintain on public.vehicle_sales to authenticated';
    execute 'grant maintain on public.vehicle_sales to service_role';
    execute 'grant maintain on public.vehicles to anon';
    execute 'grant maintain on public.vehicles to authenticated';
    execute 'grant maintain on public.vehicles to service_role';
  end if;
end
$$;

commit;
