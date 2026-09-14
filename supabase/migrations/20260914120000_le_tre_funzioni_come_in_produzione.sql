-- Le ultime tre funzioni: nei file va scritto quello che la produzione ha.
--
-- **In produzione non cambia niente.** Il testo qui sotto e' stato riletto
-- dalla produzione e la sua impronta normalizzata -- la stessa che calcola
-- `public.inventario_schema()` -- verificata su Postgres 17 in Docker:
--
--     current_dealer_has_conto_economico  f5cb550ed0f281d0b489417cf7aa601b
--     set_updated_at                      639b0a3f328ad87d6ccd5f387b66db3d
--     sync_stale_notifications            2f49969f437a2c07cde2f5b410977804
--
-- Tutte e tre identiche a quelle in vigore. Non sono trascrizioni "a occhio".
--
-- **Quanto erano diverse davvero.** Poco, e vale la pena saperlo perche'
-- spiega quanto rumore puo' fare un confronto che guarda il testo:
--
-- 1. `current_dealer_has_conto_economico`: la differenza e' **uno spazio**.
--    I file scrivevano `in ('pro', 'elite')`, la produzione `in ('pro','elite')`.
--    Nient'altro. Due righe del confronto settimanale per un carattere.
--
-- 2. `set_updated_at`: i file avevano `set search_path = public` e la
--    produzione no. **Qui i file erano piu' prudenti della produzione**, ed e'
--    una cosa da guardare -- ma non adesso: questa migration mette nei file
--    cio' che gira, e cambiare il comportamento della produzione e' un'altra
--    decisione. La funzione **non e' `security definer`**, quindi gira con i
--    permessi di chi la chiama e un `search_path` non fissato non permette di
--    scavalcare niente: e' un'imprudenza, non un buco. Segnata in AGENTS.md
--    fra le cose da sistemare dopo la pulizia.
--
-- 3. `sync_stale_notifications`: la differenza e' il nome di una variabile
--    (`v_last_inserted` invece di `v_batch_inserted`) e dove si somma il
--    conteggio. Stesso comportamento.
--
-- **Questa funzione ha tre difetti veri**, trovati leggendone il testo, e
-- **non si correggono qui**: siamo nella pulizia, e la pulizia non costruisce.
-- Sono scritti in AGENTS.md con i numeri misurati sulla produzione il
-- 14/09/2026. In breve: annuncia come "bozze dimenticate" le auto che il tetto
-- del piano ha messo da parte (76 vetture), moltiplica ogni avviso per il
-- numero di utenti della concessionaria, e cerca contatti con uno stato che in
-- produzione non esiste -- quindi l'avviso piu' utile dei due non e' mai
-- arrivato a nessuno.

begin;

create or replace function public.current_dealer_has_conto_economico()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.dealer_plan_in_force(public.current_dealer_id()) in ('pro','elite'), false);
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.sync_stale_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid := public.current_dealer_id();
  v_inserted integer := 0;
  v_last_inserted integer := 0;
begin
  if v_dealer_id is null then
    return 0;
  end if;

  with dealer_users as (
    select p.id as user_id
    from public.profiles p
    where p.dealer_id = v_dealer_id
  ),
  stale_leads as (
    select l.id, l.first_name, l.last_name, l.vehicle_id
    from public.leads l
    where l.dealer_id = v_dealer_id
      and coalesce(lower(l.status), 'created') = 'created'
      and l.created_at <= now() - interval '24 hours'
  )
  insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id)
  select
    v_dealer_id,
    du.user_id,
    'Lead non contattato da 24 ore',
    trim(concat_ws(' ', coalesce(sl.first_name, ''), coalesce(sl.last_name, ''))) ||
      case
        when sl.vehicle_id is null then ''
        else ' - lead ancora in attesa di contatto'
      end,
    'lead_stale',
    false,
    'lead',
    sl.id
  from stale_leads sl
  cross join dealer_users du
  on conflict (dealer_id, user_id, type, source_type, source_id) do nothing;

  get diagnostics v_inserted = row_count;

  with dealer_users as (
    select p.id as user_id
    from public.profiles p
    where p.dealer_id = v_dealer_id
  ),
  stale_vehicles as (
    select v.id, v.brand, v.model, v.version
    from public.vehicles v
    where v.dealer_id = v_dealer_id
      and coalesce(v.published, false) = false
      and coalesce(lower(v.status), 'draft') <> 'published'
      and v.created_at <= now() - interval '7 days'
  )
  insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id)
  select
    v_dealer_id,
    du.user_id,
    'Veicolo in bozza da oltre 7 giorni',
    trim(concat_ws(' ', sv.brand, sv.model, sv.version)) || ' non è ancora stato pubblicato.',
    'vehicle_draft_stale',
    false,
    'vehicle',
    sv.id
  from stale_vehicles sv
  cross join dealer_users du
  on conflict (dealer_id, user_id, type, source_type, source_id) do nothing;

  get diagnostics v_last_inserted = row_count;
  v_inserted := v_inserted + v_last_inserted;

  return v_inserted;
end;
$$;

commit;
