-- ============================================================
-- Il sito pubblico legge soltanto: via da anon ogni permesso di scrittura
-- ============================================================
--
-- In produzione la chiave pubblica del sito (`anon`) ha INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES, TRIGGER e MAINTAIN su `vehicles`, `dealers` e
-- `vehicle_images`: e' il regalo di Supabase su ogni tabella nuova, mai
-- tolto. Oggi non apre niente, perche' per anon esiste una sola regola di
-- accesso su ciascuna delle tre tabelle, ed e' di lettura: una scrittura
-- si ferma comunque alla protezione per riga. Ma sono due serrature, e una
-- e' aperta: basta una regola scritta male, un giorno, e la chiave che sta
-- dentro ogni pagina del sito scrive nel parco auto.
--
-- Il sito non scrive mai con quella chiave (verificato il 10/09/2026:
-- `publicSupabase` fa solo letture; il modulo contatti, il contatore delle
-- visite e il modulo demo scrivono dal server con la chiave di servizio).
--
-- **Non si usa `revoke all`**, di proposito: sulla tabella cancellerebbe
-- anche i permessi di lettura colonna per colonna, che sono l'elenco di
-- cio' che il sito puo' vedere. Si tolgono i permessi uno per uno, e la
-- lettura resta com'e'. MAINTAIN esiste solo dalla versione 17 di Postgres:
-- si toglie dove c'e'.
--
-- Ritorno: supabase/ritorni/20260910200000_ritorno.sql

begin;

revoke insert, update, delete, truncate, references, trigger on public.vehicles from anon;
revoke insert, update, delete, truncate, references, trigger on public.dealers from anon;
revoke insert, update, delete, truncate, references, trigger on public.vehicle_images from anon;

do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on public.vehicles, public.dealers, public.vehicle_images from anon';
  end if;
end
$$;

commit;
