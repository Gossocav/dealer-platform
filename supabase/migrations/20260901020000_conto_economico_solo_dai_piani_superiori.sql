-- Il conto economico si apre dal Piano Pro in su, e lo impone il database.
--
-- Le schermate lo nascondono gia' a chi ha il Base (PR #231), e per il
-- concessionario e' abbastanza: non trova i comandi, non ci arriva. Ma il
-- marketplace parla al database con la chiave pubblica del sito, che e'
-- visibile a chiunque apra la pagina: chi sapesse come si fa potrebbe leggere
-- e scrivere i propri conti economici con la sola sessione del suo account,
-- senza passare da nessuna schermata. Nascondere un bottone non e' impedire.
--
-- E' la stessa scelta a due serrature gia' fatta per l'isolamento fra
-- concessionarie: il codice dichiara, il database impone. Se un domani una
-- schermata si dimenticasse il controllo -- ed e' successo, con cinque punti
-- d'accesso su sei -- la porta resterebbe comunque chiusa.
--
-- **Cosa NON fa questa migration.** Non cancella niente. I conti gia' scritti
-- da una concessionaria che oggi ha il Base restano nella tabella, intatti:
-- diventano illeggibili per lei, e tornano visibili il giorno che passa al
-- Pro. Un dato del cliente non si butta perche' e' cambiato il piano.

begin;

-- ============================================================
-- Il piano in vigore, secondo il database
-- ============================================================
-- La stessa precedenza che applica l'applicazione (`resolveActivePlanCode`) e
-- la stessa che applica gia' `resolve_dealer_listing_cap` per il tetto degli
-- annunci: prima il piano a cui la demo e' stata convertita, poi il profilo
-- con cui la demo gira, e infine la colonna vecchia.
--
-- `dealers.subscription_plan` non basta mai da sola: dice "base" anche a una
-- concessionaria che ha attivato l'Elite, perche' la conversione non la
-- aggiorna. E' l'ultima spiaggia, non la prima fonte.
--
-- `security definer` perche' `dealer_demo_subscriptions` e' leggibile solo dal
-- servizio: la funzione espone il singolo fatto che serve -- quale piano -- e
-- non la tabella.
create or replace function public.dealer_plan_in_force(p_dealer_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_legacy text;
  v_plan text;
begin
  if p_dealer_id is null then
    return null;
  end if;

  select lower(coalesce(d.subscription_plan, ''))
  into v_legacy
  from public.dealers d
  where d.id = p_dealer_id;

  if not found then
    return null;
  end if;

  select lower(coalesce(nullif(btrim(s.converted_plan_code), ''), nullif(btrim(s.demo_profile_code), ''), ''))
  into v_plan
  from public.dealer_demo_subscriptions s
  where s.dealer_id = p_dealer_id
  limit 1;

  return nullif(coalesce(nullif(v_plan, ''), nullif(v_legacy, '')), '');
end;
$$;

-- ============================================================
-- Chi ha diritto al conto economico
-- ============================================================
-- Un piano che non si riconosce non apre la porta -- compreso il caso in cui
-- non ci sia nessun piano da leggere. E' la stessa regola dell'applicazione,
-- e la ragione e' la stessa: negare una funzione a chi ne ha diritto e' un
-- errore che si scopre subito, perche' lui lo dice; regalarla a chi non l'ha
-- pagata non lo dira' mai nessuno.
create or replace function public.dealer_has_conto_economico(p_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.dealer_plan_in_force(p_dealer_id) in ('pro', 'elite'), false);
$$;

revoke all on function public.dealer_plan_in_force(uuid) from public;
revoke all on function public.dealer_has_conto_economico(uuid) from public;
grant execute on function public.dealer_plan_in_force(uuid) to authenticated, service_role;
grant execute on function public.dealer_has_conto_economico(uuid) to authenticated, service_role;

-- ============================================================
-- Le politiche: la concessionaria giusta **e** il piano giusto
-- ============================================================
-- `current_dealer_id()` resta il fondamento dell'isolamento e non si tocca:
-- il piano e' una condizione in piu', non una al suo posto.

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
  and public.dealer_has_conto_economico(dealer_id)
);

create policy vehicle_economics_insert_own
on public.vehicle_economics
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and public.dealer_has_conto_economico(dealer_id)
);

create policy vehicle_economics_update_own
on public.vehicle_economics
for update
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and public.dealer_has_conto_economico(dealer_id)
)
with check (
  dealer_id = public.current_dealer_id()
  and public.dealer_has_conto_economico(dealer_id)
);

create policy vehicle_economics_delete_own
on public.vehicle_economics
for delete
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and public.dealer_has_conto_economico(dealer_id)
);

commit;
