-- Le notifiche dicono la verita', e non allagano piu' la campanella.
--
-- Tre difetti trovati leggendo il testo delle funzioni in produzione il
-- 14/09/2026, ognuno misurato prima di essere corretto.
--
-- **1. Meta' di `sync_stale_notifications` non trovava mai niente.** Cercava i
-- contatti con `coalesce(lower(status), 'created') = 'created'`, ma gli stati
-- dei contatti in questo progetto sono in italiano: `nuovo`, `contattato`,
-- `appuntamento`, `proposta_inviata`, `chiuso_positivo`, `chiuso_negativo`
-- (`src/lib/leads.ts`). In produzione i due contatti hanno stato `nuovo` e
-- `chiuso_negativo`, **zero con `created`**.
--
-- L'avviso *"Lead non contattato da 24 ore"* -- il piu' utile dei due, perche'
-- dice una cosa su cui si puo' agire -- **non e' mai arrivato a nessuno**.
--
-- **E quel valore non puo' nemmeno esistere.** Provando la correzione su
-- Postgres vero e' venuto fuori che `leads_status_check` -- in produzione
-- identico -- ammette **soltanto** i sei stati italiani: scrivere `created`
-- viene rifiutato dal database. La condizione era quindi morta due volte, e
-- non c'e' nessuna riga vecchia da salvare. Si cerca `nuovo` e basta.
--
-- Si allinea la funzione al gestionale e non il contrario.
--
-- **2. Diceva una cosa falsa al concessionario.** Annunciava *"Veicolo in
-- bozza da oltre 7 giorni -- non e' ancora stato pubblicato"* per ogni vettura
-- non pubblicata. Ma in produzione ci sono **76 vetture in `in_review`**, e ci
-- sono perche' **il tetto del piano ce le ha messe**: il concessionario legge
-- di avere 76 bozze dimenticate quando ha 76 auto che il suo piano non gli
-- permette di pubblicare. E' la stessa famiglia dello storico finto e del
-- margine a zero: un'informazione plausibile e sbagliata.
--
-- Adesso i due casi si distinguono:
--
-- * `status = 'draft'` -- una bozza vera, che il concessionario ha lasciato li'
--   -- continua a produrre l'avviso di prima, uno per vettura;
-- * `status = 'in_review'` -- le auto messe da parte dal tetto -- produce
--   **una sola** notifica per concessionaria, che dice la cosa vera e utile:
--   *"Il tuo piano include 50 auto: 76 del tuo sito non sono pubblicate."*
--   Il numero del piano si legge da `resolve_dealer_listing_cap`, **mai
--   scritto qui dentro**.
--
-- **3. Una sincronizzazione allagava la campanella.** Il trigger
-- `create_notification_for_new_vehicle` scriveva **una notifica per ogni auto
-- inserita**: una sincronizzazione da 140 vetture ne produceva 140. In
-- produzione delle 411 notifiche esistenti **373 sono "vehicle_new"**.
--
-- Adesso le auto **importate** producono **una notifica per sito e per
-- giorno**, che si aggiorna contando: *"12 auto importate da autogepy.it"*.
-- La colonna `conteggio` serve a questo, e a non dover leggere il numero
-- rileggendo il messaggio.
--
-- E le auto **inserite a mano** non producono piu' nessuna notifica: annunciare
-- al concessionario una cosa che ha appena fatto lui non e' un avviso, e' un
-- rumore.
--
-- **Cosa NON si corregge qui, ed e' scritto in AGENTS.md.** Le due
-- interrogazioni fanno `cross join` sugli utenti della concessionaria: **un
-- inserimento per ogni cosa per ogni utente**. Oggi ogni piano ha un utente
-- solo e non si vede; con tre utenti le notifiche si triplicano. Va risolto
-- insieme alle altre due voci della lista dei piani multiutente, non qui.
-- Il raggruppamento pero' lo rende molto meno grave: tre utenti moltiplicano
-- **una** notifica per sito, non centoquaranta.

begin;

-- ---------------------------------------------------------------------------
-- I tipi ammessi, e il contatore delle notifiche raggruppate.
-- ---------------------------------------------------------------------------

-- `notifications_type_check` elenca i tipi ammessi, e i due nuovi non c'erano:
-- il database rifiutava l'inserimento. Trovato provando la migration su
-- Postgres vero, non leggendola -- sarebbe fallita a meta' nell'editor SQL.
--
-- `vehicle_new` resta nell'elenco anche se nessuno lo scrive piu': le 411
-- notifiche gia' in archivio ce l'hanno, e toglierlo le renderebbe illegali.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'lead_new'::text,
    'vehicle_new'::text,
    'lead_stale'::text,
    'vehicle_draft_stale'::text,
    -- Le auto importate, raggruppate per sito e per giorno.
    'vehicle_import'::text,
    -- Le auto che il tetto del piano tiene fuori dalla vetrina.
    'piano_pieno'::text
  ]));

alter table public.notifications
  add column if not exists conteggio integer not null default 1;

comment on column public.notifications.conteggio is
  'Quante cose racconta questa notifica. Vale 1 per quelle singole; sale per quelle raggruppate, come le auto importate da un sito in un giorno.';

-- ---------------------------------------------------------------------------
-- 3. Le auto importate: una notifica per sito e per giorno, che conta.
-- ---------------------------------------------------------------------------

create or replace function public.create_notification_for_new_vehicle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origine text;
  v_gruppo uuid;
begin
  -- Un'auto inserita a mano non produce nessuna notifica: il concessionario
  -- l'ha appena scritta lui, e annunciargliela e' rumore.
  if new.import_source is null or btrim(new.import_source) = '' then
    return new;
  end if;

  v_origine := btrim(new.import_source);

  -- Una riga per concessionaria, sito e giorno. L'identificativo si calcola,
  -- cosi' due auto dello stesso sito nello stesso giorno finiscono sulla
  -- stessa notifica senza bisogno di cercarla prima.
  v_gruppo := md5(new.dealer_id::text || '|' || v_origine || '|' || current_date::text)::uuid;

  insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id, conteggio)
  select
    new.dealer_id,
    p.id,
    'Auto importate',
    '1 auto importata da ' || v_origine || '.',
    'vehicle_import',
    false,
    'import',
    v_gruppo,
    1
  from public.profiles p
  where p.dealer_id = new.dealer_id
  on conflict (dealer_id, user_id, type, source_type, source_id) do update
  set conteggio = public.notifications.conteggio + 1,
      message = (public.notifications.conteggio + 1)::text || ' auto importate da ' || v_origine || '.',
      read = false,
      created_at = now();

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1 e 2. Gli avvisi che maturano nel tempo.
-- ---------------------------------------------------------------------------

create or replace function public.sync_stale_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid := public.current_dealer_id();
  v_inserted integer := 0;
  v_last_inserted integer := 0;
  v_tetto integer;
  v_oltre_il_tetto integer;
  v_gruppo uuid;
begin
  if v_dealer_id is null then
    return 0;
  end if;

  -- 1. I contatti mai richiamati. Lo stato e' quello del gestionale: "nuovo"
  --    vuol dire che nessuno l'ha ancora contattato. Il vecchio `created`
  --    inglese non si cerca piu': `leads_status_check` ammette solo i sei
  --    stati italiani, quindi in archivio non puo' esistere.
  with dealer_users as (
    select p.id as user_id
    from public.profiles p
    where p.dealer_id = v_dealer_id
  ),
  stale_leads as (
    select l.id, l.first_name, l.last_name, l.vehicle_id
    from public.leads l
    where l.dealer_id = v_dealer_id
      and coalesce(lower(l.status), 'nuovo') = 'nuovo'
      and l.created_at <= now() - interval '24 hours'
  )
  insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id)
  select
    v_dealer_id,
    du.user_id,
    'Lead non contattato da 24 ore',
    trim(concat_ws(' ', coalesce(sl.first_name, ''), coalesce(sl.last_name, ''))) ||
      case
        when sl.vehicle_id is null then ''
        else ' - lead ancora in attesa di contatto'
      end,
    'lead_stale',
    false,
    'lead',
    sl.id
  from stale_leads sl
  cross join dealer_users du
  on conflict (dealer_id, user_id, type, source_type, source_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- 2a. Le bozze vere: quelle che il concessionario ha lasciato li'. Le auto
  --     messe da parte dal tetto del piano NON sono bozze e non entrano qui.
  with dealer_users as (
    select p.id as user_id
    from public.profiles p
    where p.dealer_id = v_dealer_id
  ),
  stale_vehicles as (
    select v.id, v.brand, v.model, v.version
    from public.vehicles v
    where v.dealer_id = v_dealer_id
      and coalesce(v.published, false) = false
      and coalesce(lower(v.status), 'draft') = 'draft'
      and v.created_at <= now() - interval '7 days'
  )
  insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id)
  select
    v_dealer_id,
    du.user_id,
    'Veicolo in bozza da oltre 7 giorni',
    trim(concat_ws(' ', sv.brand, sv.model, sv.version)) || ' non è ancora stato pubblicato.',
    'vehicle_draft_stale',
    false,
    'vehicle',
    sv.id
  from stale_vehicles sv
  cross join dealer_users du
  on conflict (dealer_id, user_id, type, source_type, source_id) do nothing;

  get diagnostics v_last_inserted = row_count;
  v_inserted := v_inserted + v_last_inserted;

  -- 2b. Le auto che il tetto del piano tiene fuori dalla vetrina. UNA sola
  --     notifica per concessionaria, con il numero vero del piano.
  select count(*)
  into v_oltre_il_tetto
  from public.vehicles v
  where v.dealer_id = v_dealer_id
    and coalesce(lower(v.status), '') = 'in_review'
    and coalesce(v.published, false) = false
    and v.import_source is not null
    and v.import_missing_since is null;

  if coalesce(v_oltre_il_tetto, 0) > 0 then
    v_tetto := public.resolve_dealer_listing_cap(v_dealer_id);
    v_gruppo := v_dealer_id;

    insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id, conteggio)
    select
      v_dealer_id,
      p.id,
      'Auto non pubblicate per il tuo piano',
      case
        when v_tetto is null then
          v_oltre_il_tetto::text ||
          case when v_oltre_il_tetto = 1 then ' auto del tuo sito non è pubblicata.' else ' auto del tuo sito non sono pubblicate.' end
        else
          'Il tuo piano include ' || v_tetto::text || ' auto: ' || v_oltre_il_tetto::text ||
          case when v_oltre_il_tetto = 1 then ' del tuo sito non è pubblicata.' else ' del tuo sito non sono pubblicate.' end
      end,
      'piano_pieno',
      false,
      'piano',
      v_gruppo,
      v_oltre_il_tetto
    from public.profiles p
    where p.dealer_id = v_dealer_id
    on conflict (dealer_id, user_id, type, source_type, source_id) do update
    set conteggio = excluded.conteggio,
        message = excluded.message,
        -- Si riaccende solo se il numero e' cambiato: altrimenti tornerebbe
        -- da leggere a ogni apertura del pannello.
        read = case when public.notifications.message is distinct from excluded.message then false else public.notifications.read end,
        created_at = case when public.notifications.message is distinct from excluded.message then now() else public.notifications.created_at end;

    get diagnostics v_last_inserted = row_count;
    v_inserted := v_inserted + v_last_inserted;
  else
    -- Se il tetto non tiene piu' fuori niente, l'avviso non ha piu' ragione di
    -- esistere: si toglie, invece di restare li' a dire una cosa vecchia.
    delete from public.notifications
    where dealer_id = v_dealer_id
      and type = 'piano_pieno'
      and source_type = 'piano';
  end if;

  return v_inserted;
end;
$$;

commit;
