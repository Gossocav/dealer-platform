-- =============================================================================
-- Isolamento fra concessionarie: la protezione per riga, accesa davvero.
-- =============================================================================
--
-- Trovato il 22/08/2026, alla prima prova con due concessionarie: la seconda
-- vedeva i dati della prima. La causa non era il codice ma il database.
--
-- Con la sola chiave pubblica del sito -- quella scritta dentro le pagine, che
-- chiunque legge aprendo gli strumenti del browser -- si ottenevano:
--
--   leads           nome, cognome, email, telefono e messaggio dei clienti
--   customers       l'anagrafica dei clienti
--   vehicles        tutti i veicoli, compresi quelli non pubblicati, coi prezzi
--   vehicle_images  tutte le fotografie
--   dealers         email e telefono delle concessionarie
--   profiles        i profili degli utenti
--
-- Le regole giuste esistevano gia' nell'albero delle migration
-- (rls_vehicles_policies.sql, 20260627_create_leads_table.sql e altre) ma
-- riguardavano solo chi ha fatto login, e soprattutto **la protezione non era
-- accesa**: senza "enable row level security" una politica non viene nemmeno
-- consultata. Il marketplace pubblico funzionava proprio grazie a questo, ed e'
-- il motivo per cui nessuno se n'era accorto: accendere la protezione senza
-- aggiungere il permesso pubblico avrebbe fatto sparire i veicoli dal sito.
--
-- Qui si fa tutto insieme, per ogni tabella: si accende la protezione, si
-- cancellano le politiche esistenti (qualunque siano: e' l'unico modo per
-- essere certi di cosa resta in piedi) e si installa l'insieme completo.
--
-- Il fondamento di tutto e' public.current_dealer_id(), che ricava la
-- concessionaria dall'appartenenza attiva dell'utente
-- (20260717000016_reapply_current_dealer_id_membership.sql).
--
-- Chi NON viene toccato, perche' gia' protetto: dealer_users,
-- dealer_demo_subscriptions, audit_logs, dealer_info_requests, demo_requests.
-- E chi opera con la chiave di servizio (pannello amministrativo, importazioni
-- lato server) continua a passare oltre queste regole, come deve.

begin;

-- Cancella ogni politica esistente su una tabella: quello che resta poi e'
-- solo cio' che questa migration installa.
create or replace function public.pulisci_politiche(p_tabella text)
returns void
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = p_tabella
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, p_tabella);
  end loop;
end;
$$;

-- =========================================================================
-- 1) I veicoli: pubblici solo se pubblicati, e solo di concessionarie attive
-- =========================================================================
alter table public.vehicles enable row level security;
select public.pulisci_politiche('vehicles');

-- La stessa regola che il marketplace applica nelle sue interrogazioni:
-- published = true, stato "published", concessionaria approvata o attiva.
-- Solo "anon", non "authenticated": il marketplace legge sempre senza
-- sessione (publicSupabase, in src/lib/public-marketplace.ts). Cosi' chi ha
-- fatto login vede esclusivamente i propri veicoli, e nessuna interrogazione
-- del gestionale -- nemmeno una che dimenticasse il filtro -- puo' mostrargli
-- quelli di un'altra concessionaria.
create policy vehicles_lettura_pubblica
on public.vehicles
for select
to anon
using (
  coalesce(published, false)
  and lower(coalesce(status, '')) = 'published'
  and exists (
    select 1
    from public.dealers d
    where d.id = vehicles.dealer_id
      and lower(coalesce(d.status, '')) in ('approved', 'active')
  )
);

create policy vehicles_lettura_propria
on public.vehicles
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy vehicles_inserimento_proprio
on public.vehicles
for insert
to authenticated
with check (coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id());

create policy vehicles_modifica_propria
on public.vehicles
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy vehicles_cancellazione_propria
on public.vehicles
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- =========================================================================
-- 2) Le fotografie seguono il veicolo
-- =========================================================================
alter table public.vehicle_images enable row level security;
select public.pulisci_politiche('vehicle_images');

create policy vehicle_images_lettura_pubblica
on public.vehicle_images
for select
to anon
using (
  exists (
    select 1
    from public.vehicles v
    join public.dealers d on d.id = v.dealer_id
    where v.id = vehicle_images.vehicle_id
      and coalesce(v.published, false)
      and lower(coalesce(v.status, '')) = 'published'
      and lower(coalesce(d.status, '')) in ('approved', 'active')
  )
);

create policy vehicle_images_lettura_propria
on public.vehicle_images
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy vehicle_images_inserimento_proprio
on public.vehicle_images
for insert
to authenticated
with check (coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id());

create policy vehicle_images_modifica_propria
on public.vehicle_images
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy vehicle_images_cancellazione_propria
on public.vehicle_images
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- =========================================================================
-- 3) Le concessionarie: la vetrina si vede, il resto no
-- =========================================================================
-- Il marketplace mostra nome, citta', provincia, recapiti e sito: sono dati
-- che la concessionaria vuole pubblici, ed e' cio' che rende raggiungibile un
-- annuncio. Ma solo per le concessionarie approvate: una registrazione in
-- attesa, o sospesa, non deve comparire da nessuna parte.
alter table public.dealers enable row level security;
select public.pulisci_politiche('dealers');

create policy dealers_lettura_pubblica
on public.dealers
for select
to anon
using (lower(coalesce(status, '')) in ('approved', 'active'));

create policy dealers_lettura_propria
on public.dealers
for select
to authenticated
using (id = public.current_dealer_id());

-- La pagina Impostazioni salva i propri dati. Creare o cancellare una
-- concessionaria resta un'operazione amministrativa, con la chiave di
-- servizio: qui non si concede.
create policy dealers_modifica_propria
on public.dealers
for update
to authenticated
using (id = public.current_dealer_id())
with check (id = public.current_dealer_id());

-- =========================================================================
-- 4) I lead: chiunque puo' scriverne uno, nessuno puo' leggerli
-- =========================================================================
-- Il modulo "richiedi informazioni" del marketplace scrive senza login: e'
-- voluto. Leggere e' un'altra cosa -- li' ci sono nome, email e telefono di
-- una persona.
alter table public.leads enable row level security;
select public.pulisci_politiche('leads');

create policy leads_inserimento_marketplace
on public.leads
for insert
to anon, authenticated
with check (
  source = 'marketplace'
  and vehicle_id is not null
  and exists (
    select 1
    from public.vehicles v
    where v.id = leads.vehicle_id
      and (leads.dealer_id is null or leads.dealer_id is not distinct from v.dealer_id)
  )
);

create policy leads_inserimento_proprio
on public.leads
for insert
to authenticated
with check (coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id());

create policy leads_lettura_propria
on public.leads
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy leads_modifica_propria
on public.leads
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy leads_cancellazione_propria
on public.leads
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- =========================================================================
-- 5) I profili: ognuno vede il proprio
-- =========================================================================
-- Il gestionale legge solo il ruolo dell'utente collegato; il pannello
-- amministrativo passa dalla chiave di servizio.
alter table public.profiles enable row level security;
select public.pulisci_politiche('profiles');

create policy profiles_lettura_propria
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_modifica_propria
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- =========================================================================
-- 6) Tutte le altre tabelle di concessionaria, con la stessa regola
-- =========================================================================
-- Oggi sono vuote, quindi nessuno se ne accorgerebbe: e' esattamente la
-- situazione in cui si trovavano leads e customers finche' non e' arrivato il
-- primo cliente. Si chiudono adesso.
do $$
declare
  t text;
  tabelle text[] := array[
    'customers', 'appointments', 'notifications', 'lead_activities',
    'email_messages', 'email_threads', 'email_attachments', 'email_delivery_events',
    'email_queue', 'dealer_email_templates',
    'import_profiles', 'import_runs', 'import_items', 'import_errors',
    'import_sources', 'import_dedup_keys'
  ];
begin
  foreach t in array tabelle loop
    -- Una tabella che non esiste non deve far fallire la migration: le
    -- installazioni non sono tutte allineate.
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    perform public.pulisci_politiche(t);

    execute format($p$
      create policy %I on public.%I
      for select to authenticated
      using (dealer_id = public.current_dealer_id())
    $p$, t || '_lettura_propria', t);

    execute format($p$
      create policy %I on public.%I
      for insert to authenticated
      with check (coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id())
    $p$, t || '_inserimento_proprio', t);

    execute format($p$
      create policy %I on public.%I
      for update to authenticated
      using (dealer_id = public.current_dealer_id())
      with check (dealer_id = public.current_dealer_id())
    $p$, t || '_modifica_propria', t);

    execute format($p$
      create policy %I on public.%I
      for delete to authenticated
      using (dealer_id = public.current_dealer_id())
    $p$, t || '_cancellazione_propria', t);
  end loop;
end;
$$;

drop function public.pulisci_politiche(text);

commit;
