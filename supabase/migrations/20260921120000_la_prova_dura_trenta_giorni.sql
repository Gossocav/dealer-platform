-- La prova gratuita dura trenta giorni, e la durata ha una casa sola.
--
-- **E' un cambio di prodotto, deciso dal titolare il 21/09/2026**, non la
-- correzione di un difetto: la prova passa da sette giorni a trenta.
--
-- **Perche' serve una migration e non bastano i file.** Il database di oggi
-- **rifiuta** una demo di trenta giorni. Non con un valore predefinito che si
-- possa scavalcare: con un vincolo,
-- `dealer_demo_subscriptions_extension_guard_check`, che pretende
-- `expires_at = starts_at + interval '7 days'` esatti. Provato su Postgres 17
-- ricostruito da questi stessi file, inserendo righe vere:
--
--     DEMO NUOVA di  7 giorni -> ACCETTATA
--     DEMO NUOVA di 30 giorni -> RIFIUTATA dal vincolo
--
-- Senza questa migration il primo tentativo di attivare una demo si
-- fermerebbe a meta' con la frase del database.
--
-- **Le righe gia' in archivio: non c'e' niente da migrare, e si e'
-- verificato prima di dirlo.** Al 21/09/2026 `dealer_demo_subscriptions` ha
-- quattro righe, tutte di **7,000 giorni esatti** e tutte gia'
-- **convertite** in un piano a pagamento: nessuna demo e' in corso, quindi
-- non c'e' nessuna scadenza da allungare. Sono i conti di prova del
-- titolare, che lo ha confermato per iscritto -- vedi la nota qui sotto.
--
-- **Al 21/09/2026 in produzione ci sono quattro conti di concessionaria --
-- Autogepy, De Lorenzi, Ponginibbi e Ferrari Automobili -- e sono tutti
-- **conti di prova creati dal titolare**, che lo ha confermato per iscritto:
-- non esiste ancora nessun cliente pagante, e la vendita degli abbonamenti
-- non e' cominciata.** E' la stessa nota di
-- `20260914140000_via_le_notifiche_delle_prove.sql`, aggiornata: li' erano
-- tre, adesso sono quattro. Quella di allora resta com'e': e' un verbale con
-- la sua data, e i verbali non si riscrivono.
--
-- ---
--
-- **Cosa fa questa migration, in tre mosse.**
--
-- **1. La durata prende una casa: `public.durata_della_prova()`.** Prima il
-- numero stava scritto **quattro volte** dentro le funzioni -- tre in
-- `configure_demo_profile`, una in `finalize_demo_activation` -- piu' due
-- volte nel vincolo. Adesso sta in una funzione sola e le altre la chiamano.
-- Portarla a sessanta, un giorno, e' cambiare l'`interval` qui dentro.
--
-- **2. Il vincolo smette di ripetere il numero.** Faceva due lavori in una
-- espressione sola: teneva insieme i campi della proroga (chi l'ha concessa,
-- quando, con quale motivo) **e** dettava la durata. Il primo lavoro e' utile
-- e resta identico; il secondo era la copia che invecchia, e va via.
--
-- Al suo posto, per la durata, un controllo di **buonsenso** e non di
-- precisione: una demo dura piu' di zero giorni e meno di novanta. Non
-- ripete il numero vero -- quello lo dice la funzione -- quindi non va piu'
-- toccato la prossima volta che la durata cambia.
--
-- **Perche' un intervallo e non "trenta esatti": le quattro righe storiche.**
-- Un vincolo nuovo viene verificato da Postgres su **tutte** le righe gia'
-- presenti. Provato in laboratorio, con le quattro righe da sette giorni in
-- tabella:
--
--     vincolo che pretende 30 giorni  -> ERRORE: is violated by some row
--     vincolo a intervallo (1..90 gg) -> passa
--
-- Un vincolo che pretendesse la durata esatta di oggi avrebbe fatto fallire
-- questa migration a meta' della transazione, nell'editor SQL, sul dato
-- storico.
--
-- **3. Le due funzioni che scrivono la scadenza chiamano la nuova.** Sono
-- riscritte per intero perche' in Postgres non si modifica una riga di una
-- funzione: si rifa'. Il testo qui sotto e' quello **in produzione al
-- 21/09/2026** -- verificato confrontando le impronte di tutte e quindici le
-- funzioni della demo fra la produzione e lo schema ricostruito da questi
-- file: **tutte uguali, nessuna deriva** -- con la sola sostituzione
-- dell'`interval` con la chiamata alla funzione.
--
-- ---
--
-- **Un difetto che questa migration incontra e che va dichiarato, perche' il
-- suo comportamento cambia.**
--
-- `extend_demo` dichiara di accettare una proroga **da 1 a 7 giorni**
-- (`if v_days < 1 or v_days > 7`). Il vincolo di oggi ne accetta da 7 a 14.
-- L'intersezione e' **il solo 7**: chiamando la funzione con 3 giorni il
-- database rifiuta a meta' della transazione. Provato chiamando la funzione
-- vera, dal ruolo `service_role`, sullo schema ricostruito:
--
--     proroga di 1 giorni -> ECCEZIONE DEL DATABASE (violates check constraint)
--     proroga di 3 giorni -> ECCEZIONE DEL DATABASE
--     proroga di 6 giorni -> ECCEZIONE DEL DATABASE
--     proroga di 7 giorni -> risposta pulita: DEMO_EXTENDED
--     proroga di 8 giorni -> risposta pulita: DEMO_INVALID_DURATION
--
-- **Questa migration non tocca `extend_demo`**, ma togliendo la durata dal
-- vincolo le sei durate che prima si schiantavano cominciano a funzionare, e
-- il tetto di buonsenso arriva a novanta giorni. Non e' una correzione
-- nascosta dentro un lavoro che parlava d'altro: e' la conseguenza
-- inevitabile di smettere di scrivere la durata in due posti, ed e' scritta
-- qui perche' si veda.
--
-- **Chi puo' chiamarla, allora. Letto dal catalogo, non dai file, il
-- 21/09/2026** -- perche' un'omissione e una verifica si leggono uguali, e
-- questa e' una verifica:
--
--     select coalesce(a.grantee::regrole::text,'PUBLIC'), a.privilege_type
--     from pg_proc p, aclexplode(p.proacl) a
--     where p.oid = 'public.extend_demo(uuid,uuid,text,bigint,integer)'::regprocedure;
--
--     postgres     | EXECUTE
--     service_role | EXECUTE
--
--     ruolo         | puo_eseguire        (has_function_privilege, eredita risolta)
--     public        | f
--     anon          | f
--     authenticated | f
--     service_role  | t
--
-- **Quindi e' gia' riservata al ruolo di servizio, e non serve chiuderla
-- qui.** `public` risulta `f` nel conto esplicito, e lo conferma anche
-- l'inventario della produzione: quella famiglia interroga soltanto `anon` e
-- `authenticated`, ma `has_function_privilege` risolve l'ereditarieta', e se
-- `PUBLIC` avesse `EXECUTE` `anon` risulterebbe `t`. Risulta `f`.
--
-- Tre serrature in fila, e la prima basta: il permesso e' solo del ruolo di
-- servizio; dentro la funzione `assert_demo_service_role()` rifiuta chiunque
-- non abbia quel ruolo nel token; e **nessuna riga di codice la chiama** --
-- il pulsante non esiste, cercato in tutto il progetto, test e script
-- compresi.
--
-- Resta vero che dal giorno in cui quel pulsante verra' scritto, una proroga
-- di 1..7 giorni funzionera' invece di schiantarsi. Se per una prova che
-- adesso dura trenta giorni quella finestra non e' piu' quella giusta, e' una
-- riga in `extend_demo` e una decisione del titolare.

-- ---
--
-- **Il permesso sulla funzione nuova non puo' rompere l'attivazione, e non e'
-- una deduzione.** `durata_della_prova()` e' chiusa a tutti tranne il ruolo
-- di servizio, e le due funzioni che la chiamano sono **security definer**,
-- quindi girano con i permessi del proprietario (`postgres`) e non di chi le
-- ha invocate. Letto dal catalogo il 21/09/2026 (`prosecdef`):
--
--     configure_demo_profile          | definer | postgres
--     finalize_demo_activation        | definer | postgres
--     reserve_demo_activation         | definer | postgres
--     record_demo_activation_progress | definer | postgres
--     extend_demo                     | definer | postgres
--     durata_della_prova              | invoker | postgres
--
-- **E provato, non dedotto**, sullo schema ricostruito da questi file con la
-- migration applicata -- e girando come `service_role`, cioe' il ruolo che
-- usa davvero il server, **non da superutente**: da superutente qualunque
-- permesso mancante sarebbe invisibile.
--
--     ruolo effettivo: service_role
--     configure   -> DEMO_CONFIGURED
--     reserve     -> DEMO_RESERVED
--     ATTIVAZIONE -> DEMO_ACTIVATED
--     la demo attivata dura: 30.000 giorni, stato active
--
-- E le tre controprove, perche' un permesso che non si e' mai visto
-- rifiutare non ha ancora dimostrato di esistere:
--
--     authenticated chiama configure_demo_profile -> permission denied (42501)
--     authenticated chiama durata_della_prova()   -> permission denied (42501)
--     una gemella security INVOKER che la chiama,
--       invocata da authenticated                 -> permission denied (42501)
--     la stessa gemella resa DEFINER              -> 30 days
--
-- Le ultime due righe sono la dimostrazione del meccanismo: il `revoke` ha i
-- denti, e le funzioni vere reggono **perche' sono definer**, non per caso.
-- Il giorno che qualcuno ne scrivesse una nuova come invoker, si fermerebbe
-- alla prima attivazione -- ed e' scritto qui perche' allora si sappia dove
-- guardare.

begin;

-- ---------------------------------------------------------------------------
-- 1. La casa della durata.
-- ---------------------------------------------------------------------------

-- `immutable` perche' restituisce sempre lo stesso valore: e' una costante
-- con un nome, non una lettura. `set search_path` per disciplina -- la
-- funzione non e' `security definer`, quindi non e' una serratura, ma un
-- `search_path` libero su una funzione che qualcun altro chiama resta
-- un'imprudenza gratuita.
create or replace function public.durata_della_prova()
returns interval
language sql
immutable
set search_path = public
as $$
  select interval '30 days';
$$;

comment on function public.durata_della_prova() is
  'Quanto dura la prova gratuita. Unico posto nel database in cui questo numero e'' scritto: chi calcola una scadenza chiama questa, non un interval suo. La copia per il sito sta in src/lib/durata-della-prova.ts, e un test pretende che le due dicano lo stesso numero.';

revoke all on function public.durata_della_prova() from public, anon, authenticated;
grant execute on function public.durata_della_prova() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Il vincolo smette di dettare la durata, e continua a tenere insieme i
--    campi della proroga.
-- ---------------------------------------------------------------------------

alter table public.dealer_demo_subscriptions
  drop constraint if exists dealer_demo_subscriptions_extension_guard_check;

alter table public.dealer_demo_subscriptions
  add constraint dealer_demo_subscriptions_extension_guard_check
  check (
    (
      extension_used is false
      and extended_at is null
      and extended_by is null
      and extension_reason is null
    )
    or
    (
      extension_used is true
      and extended_at is not null
      and extended_by is not null
      and char_length(btrim(extension_reason)) between 3 and 500
    )
  );

-- Il controllo di buonsenso sulla durata. Non ripete il numero vero: dice
-- soltanto che una scadenza sta dopo l'inizio e non a tre mesi di distanza,
-- cioe' prende gli errori grossi -- una sottrazione al posto di un'addizione,
-- un'unita' sbagliata -- senza dover essere aggiornato quando la durata
-- cambia.
--
-- **I novanta giorni sono scritti a mano di proposito, e non chiamano
-- `durata_della_prova()`.** Sembra un'incoerenza dentro una migration che
-- esiste proprio per togliere le copie di quel numero, e non lo e': sono
-- **due numeri diversi che oggi si somigliano**. La durata e' una decisione
-- commerciale e cambia quando il titolare vuole; il tetto e' il confine
-- oltre il quale un valore non e' piu' una prova ma un errore di
-- programmazione, e non ha nessun motivo di muoversi insieme. Un vincolo che
-- chiamasse la funzione andrebbe **rifatto a ogni cambio di durata** -- cioe'
-- esattamente la fatica che questa migration toglie -- e in piu' verrebbe
-- rivalidato su tutte le righe storiche ogni volta.
--
-- Chi legge questa riga fra sei mesi e pensa di "sistemarla" chiamando la
-- funzione: non farlo. Se la prova arrivasse a durare piu' di novanta giorni,
-- allora si alza **questo** numero, e si alza da solo.
--
-- **`is not null` esplicito, e solo qui.** Le tre colonne sono gia'
-- obbligatorie -- verificato il 21/09/2026 sia nei file sia in produzione:
-- `starts_at` e `expires_at` sono `not null`, `extension_used` pure con
-- valore predefinito `false`. La ripetizione serve contro il giorno in cui
-- qualcuno togliesse quell'obbligo: con una data vuota `expires_at >
-- starts_at` non vale `false`, vale **NULL**, e un CHECK che vale NULL
-- **passa**. Il vincolo smetterebbe di controllare senza che niente diventi
-- rosso.
--
-- Nel vincolo qui sopra non si ripete, e la differenza e' il tipo di guasto:
-- `extension_used is false` su un valore vuoto restituisce `false`, non
-- NULL, quindi nessuno dei due rami e' vero e la riga viene **rifiutata**.
-- Rumorosa. Si mette la cintura dove il guasto e' silenzioso, non dove
-- grida.
alter table public.dealer_demo_subscriptions
  drop constraint if exists dealer_demo_subscriptions_durata_ragionevole_check;

alter table public.dealer_demo_subscriptions
  add constraint dealer_demo_subscriptions_durata_ragionevole_check
  check (
    starts_at is not null
    and expires_at is not null
    and expires_at > starts_at
    and expires_at <= starts_at + interval '90 days'
  );

-- ---------------------------------------------------------------------------
-- 3. Le due funzioni che scrivono la scadenza chiedono la durata alla nuova.
--    Testo identico a quello in produzione al 21/09/2026, con la sola
--    sostituzione di `interval '7 days'` con `public.durata_della_prova()`.
-- ---------------------------------------------------------------------------

create or replace function public.configure_demo_profile(
  p_dealer_id uuid,
  p_demo_request_id uuid,
  p_profile_code text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.dealer_demo_subscriptions%rowtype;
  v_before jsonb;
  v_profile text;
  v_modules jsonb;
  v_limits jsonb;
  v_marketing jsonb;
  v_email_policy jsonb;
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_dealer_id is null or p_demo_request_id is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
  end if;

  if not exists (select 1 from public.dealers d where d.id = p_dealer_id) then
    return jsonb_build_object('outcome', 'DEMO_DEALER_NOT_FOUND');
  end if;

  if not exists (select 1 from public.demo_requests dr where dr.id = p_demo_request_id) then
    return jsonb_build_object('outcome', 'DEMO_REQUEST_NOT_FOUND');
  end if;

  select profile_code, modules_snapshot, limits_snapshot, marketing_snapshot, email_policy
  into v_profile, v_modules, v_limits, v_marketing, v_email_policy
  from public.demo_profile_snapshots(p_profile_code);

  if v_profile is null then
    return jsonb_build_object('outcome', 'DEMO_PROFILE_INVALID');
  end if;

  select * into v_row
  from public.dealer_demo_subscriptions
  where dealer_id = p_dealer_id
  for update;

  if found and v_row.demo_status in ('active', 'suspended', 'expired', 'revoked', 'converted') then
    return jsonb_build_object('outcome', 'DEMO_PROFILE_IMMUTABLE');
  end if;

  if found
     and v_row.demo_request_id = p_demo_request_id
     and v_row.demo_profile_code = v_profile
     and v_row.modules_snapshot = v_modules
     and v_row.limits_snapshot = v_limits
     and v_row.marketing_snapshot = v_marketing
     and v_row.email_policy = v_email_policy
     and v_row.demo_status = 'configured'
     and v_row.activation_state = 'idle'
     and v_row.expires_at = v_row.starts_at + public.durata_della_prova() then
    return jsonb_build_object('outcome', 'DEMO_CONFIG_NOOP', 'subscription', to_jsonb(v_row));
  end if;

  if not found then
    insert into public.dealer_demo_subscriptions (
      dealer_id,
      demo_request_id,
      demo_profile_code,
      modules_snapshot,
      limits_snapshot,
      marketing_snapshot,
      email_policy,
      starts_at,
      expires_at,
      request_status,
      activation_state,
      demo_status,
      lifecycle_version,
      activation_attempt_id,
      activation_reserved_at,
      activation_last_error,
      extension_used,
      extended_at,
      extended_by,
      extension_reason,
      created_at,
      updated_at
    )
    values (
      p_dealer_id,
      p_demo_request_id,
      v_profile,
      v_modules,
      v_limits,
      v_marketing,
      v_email_policy,
      v_now,
      v_now + public.durata_della_prova(),
      'approved_for_activation',
      'idle',
      'configured',
      1,
      null,
      null,
      null,
      false,
      null,
      null,
      null,
      v_now,
      v_now
    )
    returning * into v_row;
    v_before := null;
  else
    v_before := to_jsonb(v_row);
    update public.dealer_demo_subscriptions
    set
      demo_request_id = p_demo_request_id,
      demo_profile_code = v_profile,
      modules_snapshot = v_modules,
      limits_snapshot = v_limits,
      marketing_snapshot = v_marketing,
      email_policy = v_email_policy,
      starts_at = v_now,
      expires_at = v_now + public.durata_della_prova(),
      request_status = 'approved_for_activation',
      activation_state = 'idle',
      demo_status = 'configured',
      activation_attempt_id = null,
      activation_reserved_at = null,
      activation_last_error = null,
      extension_used = false,
      extended_at = null,
      extended_by = null,
      extension_reason = null,
      updated_at = v_now
    where id = v_row.id
    returning * into v_row;
  end if;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_type, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_by
  )
  values (
    v_row.dealer_id,
    p_actor_id,
    'user',
    'demo.configured',
    'dealer_demo_subscription',
    v_row.id,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('profile_code', v_profile),
    p_actor_id
  );

  return jsonb_build_object('outcome', 'DEMO_CONFIGURED', 'subscription', to_jsonb(v_row));
end;
$$;

create or replace function public.finalize_demo_activation(
  p_dealer_id uuid,
  p_actor_id uuid,
  p_attempt_id uuid,
  p_profile_id uuid,
  p_demo_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.dealer_demo_subscriptions%rowtype;
  v_before jsonb;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_dealer_id is null or p_attempt_id is null or p_profile_id is null or p_demo_request_id is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
  end if;

  select * into v_row
  from public.dealer_demo_subscriptions
  where dealer_id = p_dealer_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'DEMO_NOT_FOUND');
  end if;

  if v_row.demo_status = 'active'
     and v_row.activation_state = 'completed'
     and v_row.activation_attempt_id = p_attempt_id then
    return jsonb_build_object('outcome', 'DEMO_FINALIZE_NOOP', 'subscription', to_jsonb(v_row));
  end if;

  if v_row.activation_attempt_id is distinct from p_attempt_id then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_ATTEMPT_MISMATCH');
  end if;

  if v_row.activation_state <> 'membership_ready' then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_INVALID_STATE');
  end if;

  if v_row.demo_request_id <> p_demo_request_id then
    return jsonb_build_object('outcome', 'DEMO_REQUEST_MISMATCH');
  end if;

  if not exists (select 1 from public.dealers d where d.id = p_dealer_id) then
    return jsonb_build_object('outcome', 'DEMO_DEALER_NOT_FOUND');
  end if;

  if not exists (select 1 from public.demo_requests dr where dr.id = p_demo_request_id) then
    return jsonb_build_object('outcome', 'DEMO_REQUEST_NOT_FOUND');
  end if;

  if not exists (
    select 1 from public.dealer_users du
    where du.dealer_id = p_dealer_id
      and du.profile_id = p_profile_id
      and du.status = 'active'
  ) then
    return jsonb_build_object('outcome', 'DEMO_MEMBERSHIP_INVALID');
  end if;

  v_before := to_jsonb(v_row);
  update public.dealer_demo_subscriptions
  set
    starts_at = v_now,
    expires_at = v_now + public.durata_della_prova(),
    activation_state = 'completed',
    demo_status = 'active',
    request_status = 'approved_for_activation',
    activation_last_error = null,
    lifecycle_version = greatest(v_row.lifecycle_version, 1),
    updated_at = v_now
  where id = v_row.id
  returning * into v_row;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_type, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_by
  )
  values (
    p_dealer_id,
    p_actor_id,
    'user',
    'demo.activated',
    'dealer_demo_subscription',
    v_row.id,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('attempt_id', p_attempt_id, 'request_id', p_demo_request_id, 'profile_id', p_profile_id),
    p_actor_id
  );

  return jsonb_build_object('outcome', 'DEMO_ACTIVATED', 'subscription', to_jsonb(v_row));
end;
$$;
commit;
