-- ============================================================
-- Su ogni tabella, anon e authenticated hanno solo i permessi che il codice usa
-- ============================================================
--
-- **Da dove vengono i permessi di troppo.** Supabase regala ad `anon`,
-- `authenticated` e `service_role` tutti i permessi su ogni tabella creata
-- dall'editor SQL: SELECT, INSERT, UPDATE, DELETE, ma anche TRUNCATE,
-- REFERENCES e TRIGGER. Le migration di questo progetto hanno tolto quel che
-- serviva togliere una tabella per volta, ma non tutto: il 10/09/2026 il
-- confronto con la produzione ha trovato 121 permessi in piu' rispetto ai
-- file, fra cui TRUNCATE su 31 tabelle e, su otto casi, scritture che in
-- produzione passavano davvero (permesso presente *e* regola di accesso
-- presente) mentre nei file erano chiuse: email_queue, email_delivery_events,
-- notifications.
--
-- **Il criterio.** Per ogni tabella si azzera tutto e si concede solo cio'
-- che il codice usa oggi con la sessione dell'utente o con la chiave pubblica
-- del sito -- non cio' che una regola di accesso permetterebbe. Una regola
-- senza permesso resta scritta ma dormiente; un permesso senza regola e' una
-- porta con una serratura sola. Accanto a ogni tabella c'e' il file che la
-- usa: chi un giorno aggiunge una schermata che scrive dove oggi si legge
-- soltanto, sa cosa deve concedere.
--
-- **Le due serrature a colonne.** `revoke all` sulla tabella cancella anche i
-- permessi dati colonna per colonna (misurato su Postgres 15). Vanno rimessi
-- qui, per esteso: le colonne che il sito pubblico puo' leggere di `dealers`
-- e `vehicles`, e le colonne che una concessionaria puo' aggiornare di
-- `dealers` e `profiles`. Sono la difesa che tiene fuori `subscription_plan`
-- e `profiles.role`.
--
-- **Il ruolo di servizio si dichiara.** L'impalcatura della ricostruzione non
-- copia piu' i permessi predefiniti di Supabase, quindi `service_role`
-- riceve i suoi permessi qui, tabella per tabella: in produzione li ha gia'
-- e la riga non cambia niente; in una ricostruzione da zero e' l'unica
-- fonte. **Ogni tabella nuova deve fare lo stesso**, altrimenti il controllo
-- settimanale la segnala.
--
-- Provata su Postgres vero: ogni comando concesso funziona come utente, ogni
-- comando tolto viene respinto con "permission denied", la cancellazione di
-- un veicolo trascina ancora foto, conto economico e vendita (le cascate
-- girano col proprietario della tabella, non con l'utente).

begin;

-- ---------- gestionale: dati della concessionaria ----------

-- Agenda (src/app/agenda/page.tsx) crea, modifica e cancella dal browser.
revoke all on public.appointments from public, anon, authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;

-- Il gestionale scrive il registro con la sessione dell'utente
-- (src/lib/demo-audit.ts, src/lib/storico-accessi-admin.ts,
-- src/lib/vehicle-timeline.ts) e la scheda veicolo lo rilegge. Mai modifica
-- o cancellazione: un registro si aggiunge soltanto.
revoke all on public.audit_logs from public, anon, authenticated;
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

-- Clienti (src/app/clienti/page.tsx): anagrafica completa dal browser.
revoke all on public.customers from public, anon, authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;

-- Il piano in vigore si legge attraverso funzioni e dal server
-- (src/lib/dealer-plan.ts); dal browser non si tocca.
revoke all on public.dealer_demo_subscriptions from public, anon, authenticated;
grant all on public.dealer_demo_subscriptions to service_role;

-- Nessuna riga di codice la usa.
revoke all on public.dealer_email_templates from public, anon, authenticated;
grant all on public.dealer_email_templates to service_role;

-- Le richieste di informazioni le scrive e le legge solo il server.
revoke all on public.dealer_info_requests from public, anon, authenticated;
grant all on public.dealer_info_requests to service_role;

-- La propria appartenenza si legge (src/lib/dealer-id-resolution.ts); si
-- scrive solo dal server, vedi 20260910120000_dealer_users_solo_il_server_scrive.
revoke all on public.dealer_users from public, anon, authenticated;
grant select on public.dealer_users to authenticated;
grant all on public.dealer_users to service_role;

-- Il sito pubblico legge la vetrina della concessionaria colonna per colonna
-- (mai email di contatto interne, mai piano e stato dell'abbonamento). La
-- concessionaria collegata legge la propria riga e aggiorna solo i campi
-- del profilo (Impostazioni, src/app/profilo): `subscription_plan`,
-- `subscription_status`, `user_id` restano fuori dall'elenco, ed e' questo
-- che le impedisce di riscriversi il piano. Nessun inserimento o
-- cancellazione dal browser: le concessionarie le crea il titolare.
revoke all on public.dealers from public, anon, authenticated;
grant select (
  id, name, legal_name, vat_number, email, phone, whatsapp_phone,
  address, city, province, zip_code, website, logo_url, description, status,
  opening_hours, social_links, postal_code, facebook_url, instagram_url,
  linkedin_url, rental_url
) on public.dealers to anon;
grant select on public.dealers to authenticated;
grant update (
  name, legal_name, vat_number, contact_person, email, phone, whatsapp_phone,
  address, city, province, zip_code, postal_code, website, rental_url,
  logo_url, description, opening_hours, facebook_url, instagram_url,
  linkedin_url, social_links, updated_at
) on public.dealers to authenticated;
grant all on public.dealers to service_role;

-- Il modulo demo del sito scrive dal server con la chiave di servizio
-- (src/app/api/demo/request/route.ts); la regola `demo_requests_insert_public`
-- resta scritta ma senza permesso non apre niente. Il pannello admin legge e
-- scrive solo dal server.
revoke all on public.demo_requests from public, anon, authenticated;
grant all on public.demo_requests to service_role;

-- ---------- email ----------

-- Nessuna riga di codice la usa.
revoke all on public.email_attachments from public, anon, authenticated;
grant all on public.email_attachments to service_role;

-- Il registro delle consegne lo scrive solo il server
-- (src/app/api/email/send/route.ts). Prima `authenticated` poteva leggerlo:
-- nessuna schermata lo fa.
revoke all on public.email_delivery_events from public, anon, authenticated;
grant all on public.email_delivery_events to service_role;

-- La pagina Email (src/app/email/page.tsx) legge e compone dal browser;
-- l'invio e l'aggiornamento dello stato passano dal server.
revoke all on public.email_messages from public, anon, authenticated;
grant select, insert on public.email_messages to authenticated;
grant all on public.email_messages to service_role;

-- Nessuna riga di codice la usa. In produzione `authenticated` poteva
-- leggerla, scriverci e cancellare: era uno degli otto casi aperti.
revoke all on public.email_queue from public, anon, authenticated;
grant all on public.email_queue to service_role;

-- Come email_messages.
revoke all on public.email_threads from public, anon, authenticated;
grant select, insert on public.email_threads to authenticated;
grant all on public.email_threads to service_role;

-- ---------- importazione ----------
-- Sei tabelle nate con 20260906180000 per un'importazione a fasi che il
-- codice non usa: l'importazione dal sito della concessionaria
-- (src/lib/dealer-site-import.ts) non ci scrive. Nessun permesso finche'
-- una schermata non ne ha bisogno.

revoke all on public.import_dedup_keys from public, anon, authenticated;
grant all on public.import_dedup_keys to service_role;

revoke all on public.import_errors from public, anon, authenticated;
grant all on public.import_errors to service_role;

revoke all on public.import_items from public, anon, authenticated;
grant all on public.import_items to service_role;

revoke all on public.import_profiles from public, anon, authenticated;
grant all on public.import_profiles to service_role;

revoke all on public.import_runs from public, anon, authenticated;
grant all on public.import_runs to service_role;

revoke all on public.import_sources from public, anon, authenticated;
grant all on public.import_sources to service_role;

-- ---------- contatti ----------

-- Lo storico di un contatto si legge e si aggiunge dal browser
-- (src/lib/leads.ts, writeLeadActivity); non si corregge ne' si cancella.
revoke all on public.lead_activities from public, anon, authenticated;
grant select, insert on public.lead_activities to authenticated;
grant all on public.lead_activities to service_role;

-- Il CRM Lead cambia lo stato e la scheda contatto scrive le note
-- (src/components/leads/leads-crm-page.tsx, src/app/lead/[id]/page.tsx).
-- I contatti nascono solo dal modulo del sito, che scrive dal server
-- (src/app/api/marketplace/lead/route.ts); nessuna schermata li cancella.
revoke all on public.leads from public, anon, authenticated;
grant select, update on public.leads to authenticated;
grant all on public.leads to service_role;

-- Le visite si contano attraverso una funzione e si leggono solo dal
-- pannello admin, dal server.
revoke all on public.marketplace_views from public, anon, authenticated;
grant all on public.marketplace_views to service_role;

-- La campanella (src/components/notification-bell.tsx) legge e segna come
-- letto. Le notifiche le crea il database; dal browser non si cancellano.
revoke all on public.notifications from public, anon, authenticated;
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- Nessuna riga di codice la usa.
revoke all on public.platform_email_templates from public, anon, authenticated;
grant all on public.platform_email_templates to service_role;

-- Il proprio profilo si legge (src/components/auth-shell.tsx e le pagine
-- admin) e si aggiornano solo nome e preferenze: `role` e `dealer_id`
-- restano fuori dall'elenco. Inserimenti e modifiche di ruolo solo dal
-- server (src/app/api/admin/demo-requests/route.ts).
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, preferences) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- La pagina Promemoria crea, modifica e cancella dal browser.
revoke all on public.promemoria from public, anon, authenticated;
grant select, insert, update, delete on public.promemoria to authenticated;
grant all on public.promemoria to service_role;

-- Il freno alle richieste lo muove solo il server (src/lib/api-rate-limit.ts).
revoke all on public.rate_limits from public, anon, authenticated;
grant all on public.rate_limits to service_role;

-- ---------- veicoli ----------

-- Perizie (src/components/perizie): si aprono, si compilano, si chiudono.
-- Non si cancellano.
revoke all on public.vehicle_appraisals from public, anon, authenticated;
grant select, insert, update on public.vehicle_appraisals to authenticated;
grant all on public.vehicle_appraisals to service_role;

-- Archivio documenti (src/components/documenti): si caricano e si tolgono.
-- Non si modificano: un documento si sostituisce.
revoke all on public.vehicle_documents from public, anon, authenticated;
grant select, insert, delete on public.vehicle_documents to authenticated;
grant all on public.vehicle_documents to service_role;

-- Conto economico (src/components/vehicles/vehicle-economics-card.tsx,
-- vehicles-to-close-page.tsx): si crea e si aggiorna. Non si cancella da
-- solo: se ne va con il veicolo.
revoke all on public.vehicle_economics from public, anon, authenticated;
grant select, insert, update on public.vehicle_economics to authenticated;
grant all on public.vehicle_economics to service_role;

-- Le foto sono pubbliche per intero: contengono solo percorsi e ordine.
-- Il gestionale le carica, riordina e toglie.
revoke all on public.vehicle_images from public, anon, authenticated;
grant select on public.vehicle_images to anon;
grant select, insert, update, delete on public.vehicle_images to authenticated;
grant all on public.vehicle_images to service_role;

-- Riquadro compratore (src/components/vehicles/riquadro-compratore.tsx):
-- si registra e si corregge una vendita. Non si cancella da sola.
revoke all on public.vehicle_sales from public, anon, authenticated;
grant select, insert, update on public.vehicle_sales to authenticated;
grant all on public.vehicle_sales to service_role;

-- Il sito pubblico legge le colonne dell'annuncio, colonna per colonna:
-- mai prezzo d'acquisto, note interne o dati del venditore. Il gestionale
-- fa tutto sul proprio parco.
revoke all on public.vehicles from public, anon, authenticated;
grant select (
  id, dealer_id, brand, model, version, year, mileage, price, fuel,
  transmission, color, body_type, engine_size, power_cv, doors, seats,
  warranty, availability, emission_class, city, province, description,
  status, published, created_at, updated_at, equipment, interior_type,
  power_kw, registration_date, traction, vehicle_category,
  vehicle_condition, registration_month, vat_exposed, co2_emissions,
  previous_owners, video_url, ricerca_testo
) on public.vehicles to anon;
grant select, insert, update, delete on public.vehicles to authenticated;
grant all on public.vehicles to service_role;

commit;
