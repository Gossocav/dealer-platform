-- ============================================================
-- La cronologia dei veicoli sopravvive a un ripristino
-- ============================================================
--
-- Trovato il 09/09/2026 confrontando la ricostruzione da zero con la
-- produzione, tabella per tabella:
--
--                    ricostruzione   produzione
--   audit_logs              1             3
--
-- In produzione ci sono due politiche che i file non ricreano --
-- `audit_logs_insert_own` e `audit_logs_select_own` -- ed **entrambe
-- servono**: tre schermate del gestionale (l'editor del veicolo, l'elenco
-- del parco auto e la scheda) chiamano `writeVehicleTimelineEvent`, che
-- scrive su `audit_logs` **dal browser**, cioe' come utente collegato. Le
-- regole per riga si applicano; la chiave di servizio, che le scavalca, li'
-- non c'e'.
--
-- Dopo un ripristino sarebbero mancate, e la cronologia avrebbe smesso di
-- registrare **in silenzio**: `writeVehicleTimelineEvent` annota l'errore e
-- tira dritto, perche' una cronologia mancata non deve far fallire la
-- pubblicazione di un'automobile. Ci si sarebbe accorti del buco mesi dopo,
-- cercando chi ha cambiato cosa e non trovando niente.
--
-- **Non bastano le politiche.** La migration 20260717000007 fa
-- `revoke all on table public.audit_logs from authenticated`: senza
-- rimettere il permesso di tabella, le politiche non verrebbero nemmeno
-- interrogate. In produzione il permesso c'e' -- infatti il pannello scrive
-- -- ma nei file no.
--
-- Si concedono **solo lettura e inserimento**, come in produzione: una
-- cronologia che si puo' modificare o cancellare non e' una cronologia.

grant select, insert on table public.audit_logs to authenticated;

-- La lettura: ognuno vede la cronologia della propria concessionaria.
drop policy if exists audit_logs_select_own on public.audit_logs;
create policy audit_logs_select_own
on public.audit_logs
for select
to authenticated
using (dealer_id = public.current_dealer_id());

-- La scrittura: si puo' scrivere solo nella cronologia della propria
-- concessionaria, e non ci si puo' spacciare per un altro. I due `is null`
-- lasciano passare le righe scritte senza autore, che esistono: alcune
-- annotazioni nascono da un'operazione automatica e non da una persona.
drop policy if exists audit_logs_insert_own on public.audit_logs;
create policy audit_logs_insert_own
on public.audit_logs
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and (actor_profile_id is null or actor_profile_id = auth.uid())
  and (created_by is null or created_by = auth.uid())
);
