-- Il trigger dei contatti controlla, ma non completa: in produzione e' fermo
-- al 28 giugno.
--
-- **Come si e' scoperto.** Il confronto settimanale dice che
-- `enforce_lead_dealer_id()` ha un'impronta diversa fra produzione e file, ma
-- non dice quale versione ci sia. Ricostruita per confronto di impronte su
-- Postgres 17: applicando una per una le cinque versioni scritte in questo
-- repository, quella del 28/06 produce **b75bdba84c5a52a12ee2e87a74c2521b**,
-- che e' esattamente l'impronta della produzione. Non e' una deduzione: e' la
-- stessa funzione.
--
-- **Cosa fa quella versione, e cosa non fa.** Rifiuta un `dealer_id` diverso
-- da quello del veicolo:
--
--     if new.dealer_id is not null and new.dealer_id is distinct from v_vehicle_dealer_id then
--       raise exception 'dealer_id non consentito per questo veicolo.'
--
-- ma **quando `dealer_id` e' nullo non lo riempie**: la riga passa con il
-- campo vuoto. Un contatto senza concessionaria non compare nell'elenco di
-- nessuno -- non da' errore, si perde in silenzio. E' il difetto descritto in
-- AGENTS.md sotto "Un contatto senza `dealer_id` non lo vede nessuno": quella
-- nota pero' racconta una protezione che **la produzione non ha**.
--
-- La versione del 22/08 (20260822030000_lead_solo_dal_nostro_endpoint.sql) il
-- riempimento ce l'ha, e non e' mai arrivata in produzione.
--
-- **Cosa puo' succedere oggi, misurato il 14/09/2026.** Niente, e vale la pena
-- dirlo con precisione invece di allarmare:
--
-- * i contatti nascono da **un solo punto** in tutto il codice,
--   `src/app/api/marketplace/lead/route.ts:231`, che e' anche l'unico
--   `insert` su `leads` del progetto;
-- * quel percorso legge il veicolo **prima** di scrivere, imposta
--   `dealer_id: vehicleData.dealer_id` e **rifiuta** la richiesta se il
--   veicolo non ha concessionaria (righe 165-181);
-- * i due contatti in produzione (20/08 e 10/09) hanno tutti e due la
--   concessionaria, e cosi' l'unica attivita' registrata.
--
-- Il buco e' quindi **la seconda serratura che non c'e'**: oggi tiene solo il
-- codice. Il giorno che qualcuno aggiunge "nuovo contatto" al gestionale --
-- ed e' scritto in AGENTS.md che quel giorno arrivera' -- il database non lo
-- fermerebbe.
--
-- **Questa migration non cambia il comportamento di nessun percorso vivo**:
-- aggiunge il riempimento quando il campo e' nullo, e lascia intatti tutti i
-- controlli che la produzione ha gia'. Il testo e' identico a quello dei file,
-- cosi' la differenza si chiude da tutte e due le parti.

begin;

create or replace function public.enforce_lead_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_dealer_id uuid;
begin
  if tg_op = 'INSERT' and coalesce(new.source, 'marketplace') = 'marketplace' then
    if new.vehicle_id is null then
      raise exception 'vehicle_id obbligatorio per lead marketplace.' using errcode = '23502';
    end if;

    select v.dealer_id
    into v_vehicle_dealer_id
    from public.vehicles v
    where v.id = new.vehicle_id
    limit 1;

    if not found then
      raise exception 'Veicolo non trovato o non accessibile.' using errcode = '42501';
    end if;

    if new.dealer_id is null then
      -- Prima restava vuota: la richiesta veniva salvata e non la vedeva
      -- nessuno.
      new.dealer_id := v_vehicle_dealer_id;
    elsif new.dealer_id is distinct from v_vehicle_dealer_id then
      raise exception 'dealer_id non consentito per questo veicolo.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.dealer_id is distinct from old.dealer_id then
    raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

commit;
