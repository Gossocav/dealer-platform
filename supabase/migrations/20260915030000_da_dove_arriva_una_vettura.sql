-- Da dove arriva una vettura, e da quando e' in piazzale.
--
-- **La tabella che manca al Livello 3.** Oggi KeyAuto non sa una cosa
-- elementare: **da quando** una vettura e' ferma dal concessionario. La
-- giacenza si calcola da `vehicle_economics.purchase_date`, che e' dentro il
-- conto economico -- riservato al piano Pro -- e in produzione e' scritta su
-- **5 righe su 372**. Un concessionario del piano Base oggi **non ha nessun
-- modo di sapere da quanto tempo ha un'auto in piazzale**.
--
-- **Perche' una tabella nuova e non due colonne su `vehicles`.** Perche' la
-- provenienza non e' una proprieta' della vettura, e' una proprieta'
-- dell'**acquisizione**: la stessa vettura puo' essere ripresa in permuta,
-- rivenduta, e rientrare anni dopo. Tenerla a parte lascia la strada aperta
-- senza rifare niente.
--
-- **Cosa c'e' dentro, e cosa NO.**
--
--     origine     'casa_madre' oppure 'comprata'
--     canale      'permuta' | 'privato' | 'asta' | 'rete'   (solo se comprata)
--     entered_on  il giorno in cui e' entrata in piazzale
--
-- **Il prezzo d'acquisto NON e' qui**, ed e' una scelta: sta gia' in
-- `vehicle_economics.purchase_price`, e metterlo anche qui vorrebbe dire due
-- posti per lo stesso numero. E' esattamente l'errore che questo progetto ha
-- pagato il 14/09/2026 con il costo totale, dove la stessa formula viveva in
-- una funzione e in una colonna calcolata e le due dicevano cose diverse. Un
-- numero, un posto.
--
-- **Questa tabella e' visibile a TUTTI i piani**, a differenza del conto
-- economico. E' la ragione per cui esiste: la data d'ingresso e i giorni in
-- piazzale li deve vedere anche il Base, sulla scheda della sua vettura. Le
-- fasce, gli elenchi e il capitale fermo restano nella pagina Giacenza, che
-- resta Pro.
--
-- **La data d'ingresso arriva dal sito, quando c'e'.** Il blocco dati di
-- MotorK contiene `enteredInStockDate`, e la sincronizzazione scarica gia'
-- quelle pagine. Misurato il 14/09/2026:
--
--     ponginibbigroup.it   80 schede su 80, e la data e' DICHIARATA
--     autogepy.it          25 schede su 25, ma la data e' DEDOTTA
--     delorenziauto.it     il campo non c'e': il suo sito pubblica un blocco
--                          di quattro campi soli
--
-- **Dichiarata e dedotta non sono la stessa cosa**, e la differenza si
-- riconosce: quando `enteredInStockDate` coincide al millisecondo con la
-- creazione della scheda, il fornitore l'ha riempita da solo. La prova che la
-- dichiarata e' vera sta in un comportamento che nessuna data di sistema
-- potrebbe imitare: su Ponginibbi le **km 0 entrano in media 5 giorni PRIMA**
-- di essere immatricolate -- il concessionario riceve l'auto e poi la targa --
-- mentre le **usate entrano 1.400 giorni DOPO** l'immatricolazione. Su
-- Autogepy quella firma sparisce.
--
-- Quale delle due sia, si scrive in `vehicles.origine_dati` (fonte `sito` o
-- `dedotto`), e la scheda lo dice apertamente: "in piazzale da 214 giorni"
-- contro "in vetrina sul tuo sito da 88 giorni -- la data d'ingresso vera non
-- ce l'ho".
--
-- **E un dato scritto dal concessionario non viene MAI sovrascritto dalla
-- sincronizzazione**, nemmeno se il sito cambia idea. E' la regola posta dal
-- titolare il 14/09/2026, e va rispettata da chi scrive, non da chi legge:
-- prima di aggiornare `entered_on` la sincronizzazione guarda
-- `origine_dati->'entered_on'->>'fonte'`, e se vale `dealer` **non tocca
-- niente**. Il motivo e' che il concessionario ha in mano il libretto e la
-- fattura; il suo sito ha quello che qualcuno ci ha scritto dentro.
--
-- **La concessionaria non si scrive: si prende dalla vettura.** Un trigger la
-- riempie e ne impedisce il cambio, come fa `enforce_vehicle_image_dealer_id`
-- per le fotografie. Una riga senza concessionaria non la vedrebbe nessuno --
-- e' la trappola gia' pagata con i contatti orfani.

begin;

create table if not exists public.vehicle_acquisitions (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  dealer_id uuid not null references public.dealers(id) on delete cascade,

  -- Da chi arriva. Per le nuove e le km 0 e' sempre la casa madre; per le
  -- usate e' sempre comprata; per le aziendali e' l'unica cosa da chiedere.
  origine text,

  -- Da quale strada, se comprata. Serve a sapere quali canali rendono.
  canale text,

  -- Il giorno in cui e' entrata in piazzale. E' una data e non un istante:
  -- nessuno sa a che ora e' arrivata una macchina, e fingerlo darebbe una
  -- precisione che non c'e'.
  entered_on date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicle_acquisitions drop constraint if exists vehicle_acquisitions_origine_check;
alter table public.vehicle_acquisitions
  add constraint vehicle_acquisitions_origine_check
  check (origine is null or origine in ('casa_madre', 'comprata'));

alter table public.vehicle_acquisitions drop constraint if exists vehicle_acquisitions_canale_check;
alter table public.vehicle_acquisitions
  add constraint vehicle_acquisitions_canale_check
  check (canale is null or canale in ('permuta', 'privato', 'asta', 'rete'));

-- Un canale senza acquisto non vuol dire niente: se e' arrivata dalla casa
-- madre non e' stata comprata da nessun canale.
alter table public.vehicle_acquisitions drop constraint if exists vehicle_acquisitions_canale_solo_se_comprata;
alter table public.vehicle_acquisitions
  add constraint vehicle_acquisitions_canale_solo_se_comprata
  check (canale is null or origine = 'comprata');

create index if not exists vehicle_acquisitions_dealer_idx
  on public.vehicle_acquisitions using btree (dealer_id);

-- La giacenza si legge per concessionaria e per data d'ingresso.
create index if not exists vehicle_acquisitions_dealer_entered_idx
  on public.vehicle_acquisitions using btree (dealer_id, entered_on);

-- ---------------------------------------------------------------------------
-- La concessionaria si prende dalla vettura e non si cambia.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_vehicle_acquisition_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_dealer_id uuid;
begin
  select v.dealer_id into v_vehicle_dealer_id
  from public.vehicles v
  where v.id = new.vehicle_id
  limit 1;

  if v_vehicle_dealer_id is null then
    raise exception 'Veicolo non trovato o non accessibile.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.dealer_id is null then
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

drop trigger if exists trg_enforce_vehicle_acquisition_dealer_id on public.vehicle_acquisitions;
create trigger trg_enforce_vehicle_acquisition_dealer_id
  before insert or update on public.vehicle_acquisitions
  for each row
  execute function public.enforce_vehicle_acquisition_dealer_id();

-- ---------------------------------------------------------------------------
-- I permessi si dichiarano, non si ereditano.
--
-- Supabase concede ad anon, authenticated e service_role TUTTI i permessi su
-- ogni tabella creata dall'editor SQL, TRUNCATE compreso. Si toglie tutto e si
-- ridanno solo quelli che servono davvero.
-- ---------------------------------------------------------------------------

revoke all on public.vehicle_acquisitions from public;
revoke all on public.vehicle_acquisitions from anon;
revoke all on public.vehicle_acquisitions from authenticated;
revoke all on public.vehicle_acquisitions from service_role;

-- Il concessionario legge e scrive le proprie. Il pubblico **niente**: da
-- quanto tempo un'auto e' in piazzale non e' un'informazione da vetrina.
grant select, insert, update, delete on public.vehicle_acquisitions to authenticated;
grant all on public.vehicle_acquisitions to service_role;

alter table public.vehicle_acquisitions enable row level security;
alter table public.vehicle_acquisitions force row level security;

drop policy if exists vehicle_acquisitions_lettura_propria on public.vehicle_acquisitions;
create policy vehicle_acquisitions_lettura_propria on public.vehicle_acquisitions
  for select to authenticated
  using (dealer_id = public.current_dealer_id());

drop policy if exists vehicle_acquisitions_inserimento_proprio on public.vehicle_acquisitions;
create policy vehicle_acquisitions_inserimento_proprio on public.vehicle_acquisitions
  for insert to authenticated
  with check (coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id());

drop policy if exists vehicle_acquisitions_modifica_propria on public.vehicle_acquisitions;
create policy vehicle_acquisitions_modifica_propria on public.vehicle_acquisitions
  for update to authenticated
  using (dealer_id = public.current_dealer_id())
  with check (dealer_id = public.current_dealer_id());

drop policy if exists vehicle_acquisitions_cancellazione_propria on public.vehicle_acquisitions;
create policy vehicle_acquisitions_cancellazione_propria on public.vehicle_acquisitions
  for delete to authenticated
  using (dealer_id = public.current_dealer_id());

commit;
