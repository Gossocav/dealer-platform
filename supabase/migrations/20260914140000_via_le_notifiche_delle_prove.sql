-- Le 411 notifiche gia' in archivio si cancellano.
--
-- **Sono tutte di concessionarie di prova.** Al 14/09/2026 in produzione ci
-- sono tre concessionarie, e sono i conti di prova del titolare: non esiste
-- ancora nessun cliente pagante. Quelle notifiche non le ha lette nessuno e
-- non le leggera' nessuno.
--
-- **Perche' non basta lasciarle li'.** Delle 411, **373 sono "vehicle_new"**:
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
