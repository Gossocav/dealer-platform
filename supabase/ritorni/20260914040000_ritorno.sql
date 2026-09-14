-- Ritorno di 20260914040000_il_contatto_senza_concessionaria_non_nasce_piu.sql.
--
-- Rimette la versione che la produzione aveva il 14/09/2026, cioe' quella del
-- 28/06 (impronta b75bdba84c5a52a12ee2e87a74c2521b), identificata per
-- confronto di impronte e non a memoria.
--
-- **Attenzione a cosa si rimette.** Questa versione controlla ma non completa:
-- se `dealer_id` arriva nullo, la riga viene salvata con il campo vuoto e quel
-- contatto non lo vede nessuno. Si torna qui solo se il riempimento rompesse
-- qualcosa, e in quel caso il difetto va guardato subito, non lasciato.

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

    if new.dealer_id is not null and new.dealer_id is distinct from v_vehicle_dealer_id then
      raise exception 'dealer_id non consentito per questo veicolo.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.dealer_id is distinct from old.dealer_id then
      raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

commit;
