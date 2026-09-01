-- Il piano di una concessionaria non e' piu' leggibile dalle altre.
--
-- Il difetto, trovato in revisione il 01/09/2026 e provato su un Postgres
-- vero: la serratura del conto economico (20260901020000) esponeva
-- `dealer_plan_in_force(uuid)` a chiunque avesse fatto login, per **qualunque**
-- concessionaria. Una concessionaria Base ha chiesto il piano di un'altra e ha
-- ottenuto "elite".
--
-- L'identificativo di una concessionaria e' pubblico -- sta fra le colonne che
-- il marketplace legge -- quindi bastava una sessione qualunque per sapere il
-- piano di ogni concorrente sulla piattaforma. Questo progetto tratta gia'
-- quel dato come riservato: `subscription_plan` e' fuori dall'elenco delle
-- colonne pubbliche (20260831000000) proprio perche' e' il listino clienti.
--
-- **La correzione: la domanda non si fa piu' su qualcun altro.** La funzione
-- che il permesso deve poter chiamare non accetta piu' un identificativo e
-- risponde solo su chi sta chiedendo, ricavandolo da `current_dealer_id()`.
-- Quella con l'identificativo resta, perche' serve al servizio, ma non e' piu'
-- eseguibile da chi ha soltanto una sessione.
--
-- **Perche' non basta togliere il permesso e lasciare tutto com'era**: le
-- politiche per riga vengono valutate con i privilegi di chi interroga, quindi
-- una funzione che compare in una politica deve essere eseguibile da lui. La
-- funzione senza argomento risolve tutte e due le cose: e' eseguibile, e non
-- puo' rispondere su nessun altro.
--
-- Nessun conto viene toccato: cambia soltanto chi puo' chiedere cosa.

begin;

-- Il piano di **chi sta chiedendo**, e di nessun altro.
--
-- `security definer` perche' dentro deve poter leggere gli abbonamenti, che
-- sono riservati al servizio. La chiamata annidata a `dealer_plan_in_force`
-- avviene con i privilegi del proprietario della funzione, quindi non serve
-- nessun permesso a chi la invoca.
create or replace function public.current_dealer_has_conto_economico()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.dealer_plan_in_force(public.current_dealer_id()) in ('pro', 'elite'), false);
$$;

revoke all on function public.current_dealer_has_conto_economico() from public;
grant execute on function public.current_dealer_has_conto_economico() to authenticated, service_role;

-- ============================================================
-- Le politiche chiedono la stessa cosa, ma su se stesse
-- ============================================================
-- `current_dealer_id()` resta il fondamento dell'isolamento fra
-- concessionarie: il piano e' una condizione in piu', non una al suo posto.

drop policy if exists vehicle_economics_select_own on public.vehicle_economics;
drop policy if exists vehicle_economics_insert_own on public.vehicle_economics;
drop policy if exists vehicle_economics_update_own on public.vehicle_economics;
drop policy if exists vehicle_economics_delete_own on public.vehicle_economics;

create policy vehicle_economics_select_own
on public.vehicle_economics
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and public.current_dealer_has_conto_economico()
);

create policy vehicle_economics_insert_own
on public.vehicle_economics
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and public.current_dealer_has_conto_economico()
);

create policy vehicle_economics_update_own
on public.vehicle_economics
for update
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and public.current_dealer_has_conto_economico()
)
with check (
  dealer_id = public.current_dealer_id()
  and public.current_dealer_has_conto_economico()
);

create policy vehicle_economics_delete_own
on public.vehicle_economics
for delete
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and public.current_dealer_has_conto_economico()
);

-- ============================================================
-- Si chiude la porta rimasta aperta
-- ============================================================
-- Ora che nessuna politica la nomina piu', la funzione che risponde su una
-- concessionaria qualunque torna a essere roba del servizio. Si toglie del
-- tutto quella che chiedeva il piano di un altro.

drop function if exists public.dealer_has_conto_economico(uuid);

revoke all on function public.dealer_plan_in_force(uuid) from public;
revoke all on function public.dealer_plan_in_force(uuid) from authenticated;
grant execute on function public.dealer_plan_in_force(uuid) to service_role;

commit;
