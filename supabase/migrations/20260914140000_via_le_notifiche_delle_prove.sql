-- Le notifiche gia' in archivio si cancellano tutte.
--
-- Erano **411 il 14/09/2026 alle 11**, ed erano gia' **413** tre ore dopo: il
-- numero cresce a ogni sincronizzazione, e per questo non e' scritto qui
-- dentro. Il conteggio vero lo stampa la migration stessa quando gira.
--
-- **Sono tutte di concessionarie di prova.** Al 14/09/2026 in produzione ci
-- sono tre concessionarie collegate -- Autogepy, De Lorenzi, Ponginibbi -- e
-- sono **conti di prova creati dal titolare**, che lo ha confermato per
-- iscritto: non esiste ancora nessun cliente pagante, e la vendita degli
-- abbonamenti non e' cominciata. Quelle notifiche non le ha lette nessuno e
-- non le leggera' nessuno.
--
-- **Si tocca solo `public.notifications`, e niente altro.** Nessun veicolo,
-- nessun contatto, nessun cliente, nessuna fotografia: l'unica istruzione che
-- scrive e' il `delete` qui sotto, e nomina quella tabella sola. Una notifica
-- non ha figli: nessuna riga di nessun'altra tabella la referenzia -- si
-- controlla cosi':
--
--     select conrelid::regclass from pg_constraint
--     where contype = 'f' and confrelid = 'public.notifications'::regclass;
--
-- Al 14/09/2026 quella interrogazione non restituisce niente.
--
-- **Perche' non basta lasciarle li'.** La grande maggioranza -- 373 su 411 al
-- momento della misura -- sono **"vehicle_new"**:
-- una per ogni auto importata, cioe' esattamente l'alluvione che
-- `20260914130000` ha appena tolto. Lasciarle vorrebbe dire che il primo
-- cliente vero aprirebbe la campanella su trecentosettantatre avvisi che non
-- lo riguardano, e non vedrebbe mai quelli che contano. E le "veicolo in bozza
-- da oltre 7 giorni" dicono la cosa falsa corretta nella stessa migration:
-- restare, direbbero ancora che settantasei auto sono bozze dimenticate.
--
-- **Si cancellano tutte, non solo alcune.** Un elenco parziale lascerebbe
-- notifiche vecchie accanto a notifiche nuove con regole diverse, e nessuno
-- saprebbe piu' quali sono affidabili. Quelle che servono davvero le riscrive
-- `sync_stale_notifications` alla prima apertura del pannello: i contatti mai
-- richiamati e le auto tenute fuori dal tetto ricompaiono da soli, **con il
-- testo giusto**.
--
-- **Va eseguita dopo `20260914130000`**, non prima: altrimenti il vecchio
-- trigger ricomincerebbe a scriverne una per auto.
--
-- Il conteggio prima e dopo si legge cosi':
--
--     select type, count(*) from public.notifications group by type order by 2 desc;

begin;

do $$
declare
  n bigint;
begin
  select count(*) into n from public.notifications;
  raise notice 'Notifiche in archivio prima della pulizia: %', n;
end
$$;

delete from public.notifications;

commit;
