-- La protezione delle attivita' dei contatti esiste solo in produzione.
--
-- `public.enforce_lead_activity_dealer_id()` e il suo trigger
-- `trg_enforce_lead_activity_dealer_id` girano in produzione dal giorno che
-- qualcuno li ha scritti a mano nell'editor SQL, e **non stanno in nessun file
-- di questo repository**. Il confronto settimanale li segnala come "in
-- produzione ma non nei file" da quando esiste.
--
-- **Cosa si perderebbe.** In una ricostruzione da zero -- il ripristino dopo
-- un guasto, o una copia di prova -- quella funzione e quel trigger **non ci
-- sarebbero**. Le attivita' dei contatti potrebbero nascere senza
-- concessionaria, o con quella di un altro: e' la stessa famiglia del contatto
-- orfano, ma su una tabella che nessuno guarda mai a mano.
--
-- **Questa migration non cambia niente in produzione**: ci mette esattamente
-- cio' che c'e' gia'. Serve perche' ci sia anche nei file.
--
-- **Come si sa che e' identica.** Il testo e' stato riletto dalla produzione e
-- la sua impronta normalizzata -- la stessa che calcola
-- `public.inventario_schema()`, senza commenti e senza spazi -- e' stata
-- verificata su Postgres 17 in Docker:
--
--     calcolata  90c34fb4e0677aca944f1e23efc71f7f
--     produzione 90c34fb4e0677aca944f1e23efc71f7f
--
-- Non e' una trascrizione fedele "a occhio": e' la stessa funzione.
--
-- **Cosa fa.** Prima di scrivere un'attivita' su un contatto: trova la
-- concessionaria del contatto, rifiuta se il contatto non esiste, rifiuta se
-- non e' la concessionaria di chi sta scrivendo, e riempie `dealer_id` quando
-- arriva vuoto. E' la protezione che `enforce_lead_dealer_id` **non** aveva in
-- produzione, applicata bene un piano piu' sotto.

begin;

create or replace function public.enforce_lead_activity_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_dealer_id uuid;
  v_dealer_id uuid;
begin
  v_dealer_id := public.current_dealer_id();

  select l.dealer_id
  into v_lead_dealer_id
  from public.leads l
  where l.id = new.lead_id
  limit 1;

  if v_lead_dealer_id is null then
    raise exception 'Lead non trovato o non accessibile.' using errcode = '42501';
  end if;

  if v_lead_dealer_id <> v_dealer_id then
    raise exception 'lead_id non appartiene al dealer autenticato.' using errcode = '42501';
  end if;

  if new.dealer_id is null then
    new.dealer_id := v_lead_dealer_id;
  elsif new.dealer_id <> v_lead_dealer_id then
    raise exception 'dealer_id non consentito per questa attivita.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Il trigger si rifa' identico a quello di produzione. `drop ... if exists`
-- prima, perche' `create trigger` non ha una forma "or replace": senza il drop
-- una seconda applicazione fallirebbe, e in produzione il trigger c'e' gia'.
drop trigger if exists trg_enforce_lead_activity_dealer_id on public.lead_activities;
create trigger trg_enforce_lead_activity_dealer_id
  before insert on public.lead_activities
  for each row
  execute function public.enforce_lead_activity_dealer_id();

commit;
