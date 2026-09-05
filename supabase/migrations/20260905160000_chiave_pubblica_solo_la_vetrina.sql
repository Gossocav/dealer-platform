-- =============================================================================
-- La chiave pubblica del sito apre solo la vetrina, e nient'altro.
-- =============================================================================
--
-- Trovato il 05/09/2026 durante una verifica di sicurezza, e provato contro la
-- produzione vera con la sola chiave pubblica -- quella scritta dentro le
-- pagine, che chiunque legge aprendo gli strumenti del browser:
--
--   notify_dealer_users(...)              -> 204, eseguita
--   dealer_plan_in_force(<concessionaria>) -> "elite"
--   resolve_dealer_listing_cap(...)        -> 300
--
-- La prima scrive avvisi nel pannello di **qualunque** concessionaria, con
-- titolo e testo scelti da chi chiama, saltando la protezione per riga perche'
-- e' `security definer`. Gli identificativi delle concessionarie sono pubblici
-- per progetto -- servono al marketplace -- quindi non c'era niente da
-- indovinare. Le altre due svelano il piano commerciale di ogni cliente:
-- l'elenco di chi paga 99, chi 199 e chi 399.
--
-- ============================================================
-- Perche' era aperto: una formula che sembra chiudere e non chiude
-- ============================================================
--
-- Le migration recenti scrivono:
--
--     revoke all on function public.dealer_plan_in_force(uuid) from public;
--
-- Sembra "togli il permesso a tutti". Su Supabase **non e' cosi'**. Supabase
-- concede in automatico ad `anon`, `authenticated` e `service_role` tutto cio'
-- che nasce nello schema public, e lo fa con una concessione *esplicita* a
-- quei tre ruoli, separata da quella a `public`. Togliere a `public` non tocca
-- quella esplicita: `anon` resta dentro.
--
-- Che sia questo, e non una migration dimenticata, lo dice
-- `current_dealer_has_perizie()`: in produzione **esiste** -- risponde
-- `false`, non "funzione sconosciuta" -- quindi 20260902110000 e' stata
-- applicata; e nella stessa transazione c'era il suo `revoke ... from public`.
-- Eppure con la chiave pubblica si esegue lo stesso. La migration e' passata:
-- e' la formula che non chiude.
--
-- La differenza si vede confrontando le migration del ciclo demo
-- (20260717000005), che scrivono `from public, anon, authenticated` e in
-- produzione risultano davvero chiuse, con quelle piu' recenti che scrivono
-- solo `from public` e in produzione risultano aperte. Stessa intenzione, due
-- esiti opposti, sei volte di fila:
--
--   dealer_plan_in_force                20260901020000  e  20260901040000
--   dealer_has_conto_economico          20260901020000  (poi eliminata, non c'e' piu')
--   current_dealer_has_conto_economico  20260901040000
--   current_dealer_has_perizie          20260902110000
--   current_dealer_id                   20260717000016
--   elite_showcase_dealer_ids           20260727030000  (voluta pubblica, resta)
--
-- Da qui in avanti si nomina sempre `anon`. Per le tabelle il blocco 3 fa in
-- modo che una tabella nuova nasca chiusa; per le funzioni Postgres non
-- permette la stessa cosa -- il perche', misurato, sta scritto li' -- e il
-- presidio e' un test che gira in CI.
--
-- ============================================================
-- Cosa NON si tocca
-- ============================================================
--
-- Senza sessione il marketplace legge tre tabelle e nient'altro: `vehicles`,
-- `dealers` e `vehicle_images` (verificato leggendo ogni interrogazione che
-- passa da publicSupabase, in src/app/(marketplace)/**, src/app/og/** e
-- src/app/sitemap.ts). Su vehicles e dealers il permesso e' per colonna
-- (20260831000000, 20260901030000, 20260903140000): toccarle qui vorrebbe dire
-- riscrivere quegli elenchi, quindi si saltano del tutto.
--
-- Resta pubblica anche `elite_showcase_dealer_ids()`: la vetrina Elite in home
-- e il video sull'annuncio la chiamano senza sessione, ed e' fatta apposta per
-- rispondere solo "quali sono Elite", senza date ne' storico.
--
-- Provata su Postgres 15 in Docker, con i ruoli e i privilegi predefiniti di
-- Supabase ricostruiti: prima della migration `anon` poteva eseguire tutte e
-- sette le funzioni e leggere tutte e sette le tabelle; dopo, nessuna delle
-- due -- mentre marketplace, gestionale e chiave di servizio continuano a
-- funzionare, compresi gli avvisi automatici su nuovo lead e nuovo veicolo.

begin;

-- ============================================================
-- 1) Le funzioni
-- ============================================================

-- Scrive avvisi nel pannello di una concessionaria qualsiasi. Non la chiama
-- nessuna riga dell'applicazione: la usano solo i due trigger su leads e
-- vehicles, che sono `security definer` e quindi la eseguono coi privilegi del
-- proprietario, non con quelli di chi ha fatto l'inserimento. Si puo' chiudere
-- a tutti e due i ruoli senza spegnere gli avvisi automatici.
revoke all on function public.notify_dealer_users(uuid, text, text, text, text, uuid) from public;
revoke all on function public.notify_dealer_users(uuid, text, text, text, text, uuid) from anon;
revoke all on function public.notify_dealer_users(uuid, text, text, text, text, uuid) from authenticated;
grant execute on function public.notify_dealer_users(uuid, text, text, text, text, uuid) to service_role;

-- Il tetto annunci del piano: la usa solo il trigger che applica il limite,
-- anch'esso `security definer`.
revoke all on function public.resolve_dealer_listing_cap(uuid) from public;
revoke all on function public.resolve_dealer_listing_cap(uuid) from anon;
revoke all on function public.resolve_dealer_listing_cap(uuid) from authenticated;
grant execute on function public.resolve_dealer_listing_cap(uuid) to service_role;

-- Il piano di una concessionaria a scelta. Nell'applicazione la chiama solo il
-- cron dei promemoria, con la chiave di servizio. Le due funzioni "ha diritto
-- a" qui sotto la chiamano annidata, quindi coi privilegi del proprietario:
-- chiuderla a `authenticated` non toglie niente al gestionale. E' cio' che
-- 20260901040000 voleva gia' fare.
revoke all on function public.dealer_plan_in_force(uuid) from public;
revoke all on function public.dealer_plan_in_force(uuid) from anon;
revoke all on function public.dealer_plan_in_force(uuid) from authenticated;
grant execute on function public.dealer_plan_in_force(uuid) to service_role;

-- Queste tre servono a chi ha fatto login -- le usano le regole per riga di
-- vehicle_economics e vehicle_appraisals, e la campanella degli avvisi -- ma
-- non hanno niente da dire a chi non ha una sessione. Per `anon` rispondono
-- comunque "niente", perche' current_dealer_id() senza sessione e' vuoto: e'
-- una porta che non porta da nessuna parte, e va chiusa lo stesso.
revoke all on function public.current_dealer_id() from public;
revoke all on function public.current_dealer_id() from anon;
grant execute on function public.current_dealer_id() to authenticated, service_role;

revoke all on function public.current_dealer_has_conto_economico() from public;
revoke all on function public.current_dealer_has_conto_economico() from anon;
grant execute on function public.current_dealer_has_conto_economico() to authenticated, service_role;

revoke all on function public.current_dealer_has_perizie() from public;
revoke all on function public.current_dealer_has_perizie() from anon;
grant execute on function public.current_dealer_has_perizie() to authenticated, service_role;

revoke all on function public.sync_stale_notifications() from public;
revoke all on function public.sync_stale_notifications() from anon;
grant execute on function public.sync_stale_notifications() to authenticated, service_role;

-- ============================================================
-- 2) Le tabelle
-- ============================================================
--
-- Il 22/08/2026 la protezione per riga era scritta e non accesa, e con la sola
-- chiave pubblica si leggevano nome, email e telefono dei clienti. Da allora
-- e' accesa, ed e' quello che oggi ferma la lettura. Ma su sette tabelle e'
-- l'unica cosa che la ferma: il permesso c'e' ancora, e si vede dalla risposta
-- che il database da' alla chiave pubblica -- `[]` (permesso concesso, regola
-- rispettata) invece di "permesso negato".
--
-- Le tabelle nate dopo (vehicle_documents, vehicle_economics, vehicle_sales,
-- vehicle_appraisals, promemoria, marketplace_views) il permesso lo tolgono
-- gia'. Qui si allinea tutto il resto, e si tolgono di mezzo anche le tabelle
-- che nessuno ha pensato di elencare: si passano tutte, tranne le tre della
-- vetrina.
do $$
declare
  t record;
  vetrina text[] := array['vehicles', 'dealers', 'vehicle_images'];
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename <> all (vetrina)
    order by tablename
  loop
    execute format('revoke all on table public.%I from anon', t.tablename);
  end loop;
end;
$$;

-- ============================================================
-- 3) Perche' non ricapiti con la prossima funzione
-- ============================================================
--
-- Le sei sviste qui sopra non sono sei disattenzioni: sono la stessa regola
-- scritta male sei volte, perche' la formula sbagliata *sembra* giusta e non
-- si lamenta. Finche' `anon` riceve tutto in automatico, la prossima funzione
-- nascera' aperta e nessuno se ne accorgera'.
--
-- Da qui in avanti una **tabella** nuova nasce chiusa ad `anon`. Chi vorra'
-- esporne una -- come e' giusto per la vetrina -- dovra' scrivere un grant
-- esplicito, che in revisione si vede.
--
-- Vale per gli oggetti creati da `postgres`, che e' il proprietario di tutto
-- lo schema public di questo progetto ed e' il ruolo con cui girano sia
-- l'editor SQL sia le migration. Non tocca niente di cio' che esiste gia'.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- **Per le funzioni la stessa cosa non si puo' fare, e qui non si finge.**
--
-- Postgres concede da solo `execute` a `public` su ogni funzione nuova, e
-- `anon` fa parte di `public`. Il rimedio che verrebbe naturale --
--
--     alter default privileges in schema public revoke execute on functions from public;
--
-- -- viene accettato senza errori e **non viene registrato**: provato su
-- Postgres 15 in Docker, `pg_default_acl` resta `{authenticated=X/postgres}`,
-- senza nessuna traccia della revoca, e la funzione creata subito dopo nasce
-- con `=X/postgres`, cioe' eseguibile da chiunque. Provato in tre modi: su un
-- database vergine, su uno con le concessioni predefinite di Supabase, e
-- prima e dopo aver concesso ad altri ruoli. Sempre lo stesso esito.
--
-- Una riga che sembra proteggere e non protegge e' l'errore che questa
-- migration sta correggendo: metterne una qui sarebbe ripeterlo. Quindi non
-- c'e'.
--
-- Il presidio per le funzioni sta altrove, dove funziona davvero:
-- `src/lib/funzioni-sql-chiuse.test.ts` legge il testo delle migration e
-- fallisce in CI se una funzione nuova non dichiara che cosa fa con `anon`.
-- Non e' una serratura del database, e' un cancello prima: avvisa chi scrive
-- la migration, quando puo' ancora rimediare.

-- ============================================================
-- 4) La migration si controlla da sola
-- ============================================================
--
-- Un `revoke` che non ha avuto effetto non protesta: restituisce "REVOKE" e va
-- avanti. E' esattamente cosi' che le sei sviste sono passate inosservate per
-- mesi. Qui la migration rilegge i permessi veri e si rifiuta di chiudere se
-- il risultato non e' quello dichiarato.
do $$
declare
  aperte text[] := '{}';
  f text;
  t record;
begin
  foreach f in array array[
    'public.notify_dealer_users(uuid, text, text, text, text, uuid)',
    'public.resolve_dealer_listing_cap(uuid)',
    'public.dealer_plan_in_force(uuid)',
    'public.current_dealer_id()',
    'public.current_dealer_has_conto_economico()',
    'public.current_dealer_has_perizie()',
    'public.sync_stale_notifications()'
  ] loop
    if has_function_privilege('anon', f, 'execute') then
      aperte := aperte || ('funzione ' || f);
    end if;
  end loop;

  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not in ('vehicles', 'dealers', 'vehicle_images')
  loop
    if has_table_privilege('anon', format('public.%I', t.tablename), 'select') then
      aperte := aperte || ('tabella ' || t.tablename);
    end if;
  end loop;

  if array_length(aperte, 1) > 0 then
    raise exception 'La chiave pubblica raggiunge ancora: %', array_to_string(aperte, ', ')
      using errcode = '42501';
  end if;
end;
$$;

-- E il contrario: cio' che deve restare aperto e' rimasto aperto. Una
-- migration che chiude troppo si scopre altrimenti dal sito che non mostra
-- piu' le automobili.
do $$
begin
  if not has_function_privilege('anon', 'public.elite_showcase_dealer_ids()', 'execute') then
    raise exception 'La vetrina Elite non e piu leggibile dal marketplace.' using errcode = '42501';
  end if;

  if not has_column_privilege('anon', 'public.vehicles', 'id', 'select')
     or not has_column_privilege('anon', 'public.dealers', 'id', 'select')
     or not has_table_privilege('anon', 'public.vehicle_images', 'select') then
    raise exception 'Il marketplace non legge piu la vetrina.' using errcode = '42501';
  end if;

  if not has_function_privilege('authenticated', 'public.current_dealer_id()', 'execute')
     or not has_function_privilege('authenticated', 'public.current_dealer_has_conto_economico()', 'execute')
     or not has_function_privilege('authenticated', 'public.current_dealer_has_perizie()', 'execute')
     or not has_function_privilege('authenticated', 'public.sync_stale_notifications()', 'execute') then
    raise exception 'Il gestionale ha perso un permesso che gli serve.' using errcode = '42501';
  end if;
end;
$$;

commit;
