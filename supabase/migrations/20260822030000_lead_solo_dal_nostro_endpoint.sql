-- =============================================================================
-- Le richieste di informazioni entrano solo dal nostro endpoint.
-- =============================================================================
--
-- Finora chiunque poteva scrivere un lead direttamente nel database usando la
-- chiave pubblica del sito, senza passare da /api/marketplace/lead. Il limite
-- di frequenza contro gli abusi vive dentro quell'endpoint: scrivendo diritto
-- al database lo si scavalcava, e nulla impediva di riempire la casella dei
-- contatti di una concessionaria.
--
-- Il permesso non serve piu': dal 22/08/2026 e' la chiave di servizio a
-- scrivere il lead, lato server, dopo che l'endpoint ha validato i dati
-- (PR #167). La chiave pubblica le serviva solo per quello.
--
-- Cosa continua a funzionare:
-- - il modulo "richiedi informazioni" del marketplace, che passa dall'endpoint;
-- - l'inserimento manuale dal gestionale, che avviene da utente collegato ed
--   e' coperto da leads_inserimento_proprio.
--
-- In piu': il controllo che accompagna i lead compila la concessionaria
-- quando manca, invece di lasciarla vuota. Una riga senza concessionaria,
-- da quando la protezione per riga lega la lettura al proprietario, sarebbe
-- invisibile a tutti -- una richiesta ricevuta e mai vista.

begin;

drop policy if exists leads_inserimento_marketplace on public.leads;

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

drop trigger if exists trg_enforce_lead_dealer_id on public.leads;
create trigger trg_enforce_lead_dealer_id
before insert or update on public.leads
for each row
execute function public.enforce_lead_dealer_id();

commit;
