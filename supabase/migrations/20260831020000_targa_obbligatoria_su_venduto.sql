-- Un'automobile venduta deve avere una targa o un numero di telaio.
--
-- E' l'unica cosa che identifica davvero la vettura di cui si sta registrando
-- la vendita. Marca, modello e allestimento si ripetono: al 31/08/2026 in
-- produzione c'erano cinque "Peugeot 2008 Allure PureTech 100 S&S" identiche
-- in tutto. Senza targa ne' telaio, un archivio delle vendite non dice **quale**
-- automobile e' stata venduta, e a distanza di mesi non e' piu' ricostruibile.
--
-- **Vale nel database e non solo nella schermata**, di proposito: lo stato si
-- puo' cambiare da piu' punti -- la pagina "Da chiudere", il modulo di
-- modifica, un domani un'importazione -- e una regola scritta in uno solo di
-- quei posti e' una regola che prima o poi si aggira senza accorgersene.
--
-- I **conti economici restano facoltativi**: quanto e' costata e a quanto e'
-- stata venduta li scrive il concessionario se e quando vuole. Sono cose sue,
-- e obbligarlo a compilarle per chiudere una vendita significherebbe
-- costringerlo a inventare numeri pur di andare avanti -- che e' il modo piu'
-- sicuro di riempire l'archivio di cifre false.
--
-- Nessuna riga esistente viene toccata: al 31/08/2026 nessuna delle 269
-- automobili in archivio risulta venduta, quindi non c'e' storico da sanare.
-- La regola vale da adesso in avanti.

begin;

create or replace function public.enforce_plate_on_sold()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_stato text := lower(btrim(coalesce(new.status, '')));
  v_targa text := btrim(coalesce(new.plate, ''));
  v_telaio text := btrim(coalesce(new.vin, ''));
begin
  -- "delivered" e' il passo dopo "sold": se la prima lo pretende, la seconda
  -- non puo' essere una scorciatoia per aggirarla.
  if v_stato in ('sold', 'delivered') and v_targa = '' and v_telaio = '' then
    raise exception 'Per segnare una vettura come venduta serve la targa o il numero di telaio'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_plate_on_sold on public.vehicles;

-- Dopo trg_enforce_vehicle_dealer_id, che assegna la concessionaria: i
-- trigger "before" con lo stesso momento scattano in ordine alfabetico, e
-- questo controllo non ha bisogno di precedere quello.
create trigger trg_enforce_plate_on_sold
  before insert or update on public.vehicles
  for each row
  execute function public.enforce_plate_on_sold();

commit;
