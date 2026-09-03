-- La perizia di una vettura: com'era il giorno che l'abbiamo guardata.
--
-- Chiesta dal titolare il 02/09/2026. Serve **prima** di comprare: l'auto che
-- il cliente porta in permuta, o quella che il concessionario va a vedere dal
-- privato. Non e' ancora sua, e questo decide quasi tutto il resto.
--
-- **Perche' una tabella a se' e non altre colonne su `vehicles`.** L'auto
-- periziata nella maggior parte dei casi non e' nel parco: non c'e' nessuna
-- riga a cui appendersi. E quando poi la si compra, la perizia resta il
-- documento di com'era *prima*, che e' un'altra cosa dalla scheda di vendita.
-- `vehicle_id` c'e' ma e' facoltativo, e si riempie il giorno dell'acquisto.
--
-- **Perche' la concessionaria non si ricava dal veicolo.** Il conto economico
-- puo' farlo (20260831010000) perche' parte sempre da un'auto in stock. Qui
-- no, e allora la concessionaria e' quella di chi scrive, secondo
-- `current_dealer_id()`: il trigger la mette e rifiuta chi ne dichiara
-- un'altra, invece di correggere in silenzio.
--
-- **Perche' il rilievo sta in un documento e non in cinquanta colonne.** Le
-- voci guardate sono una cinquantina -- pannello per pannello, ruota per ruota
-- -- e cambieranno: una colonna per voce vorrebbe dire una migration ogni
-- volta che si aggiunge una riga all'elenco, e cinquanta colonne quasi sempre
-- vuote. Le voci che servono a cercare e a fare i conti (targa, chilometri,
-- costi, valore proposto) restano colonne vere; il rilievo sta in `conditions`,
-- e la sua forma la governa `src/lib/scheda-perizia.ts`, che e' l'unico posto
-- dove l'elenco delle voci e' scritto.
--
-- I costi di rimessa a nuovo sono separati per voce e il totale lo calcola il
-- database, come nel conto economico: un totale scritto dall'applicazione
-- resta indietro rispetto alle voci da cui deriva.
--
-- Provata su un Postgres 15 vero prima di spedirla.

begin;

create table if not exists public.vehicle_appraisals (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,

  -- Il veicolo, se l'auto e' stata poi comprata ed e' entrata nel parco.
  -- Facoltativo: quasi sempre la perizia nasce prima che il veicolo esista.
  vehicle_id uuid references public.vehicles(id) on delete set null,

  -- La vettura periziata, scritta a mano perche' non c'e' nessuna scheda
  brand text,
  model text,
  version text,
  plate text,
  vin text,
  registration_date date,
  mileage integer,
  fuel text,
  transmission text,
  color text,

  -- Da chi arriva
  owner_name text,
  owner_phone text,

  -- Il rilievo, voce per voce. La forma sta in src/lib/scheda-perizia.ts
  conditions jsonb not null default '{}'::jsonb,

  -- Quanto costa rimetterla a posto, separato per capire dove
  cost_body numeric(12, 2) not null default 0,
  cost_mechanical numeric(12, 2) not null default 0,
  cost_tyres numeric(12, 2) not null default 0,
  cost_interior numeric(12, 2) not null default 0,
  cost_other numeric(12, 2) not null default 0,

  reconditioning_total numeric(12, 2) generated always as (
    cost_body + cost_mechanical + cost_tyres + cost_interior + cost_other
  ) stored,

  -- La conclusione
  offered_price numeric(12, 2),
  notes text,
  appraiser text,
  appraised_on date not null default current_date,

  -- Una perizia aperta si puo' ancora correggere; una chiusa e' il documento
  -- che si mostra al venditore. Non si impedisce di riaprirla: chi peritia
  -- torna sull'auto, e un documento che non si puo' correggere viene rifatto
  -- da capo su un foglio a parte, che e' peggio.
  status text not null default 'aperta',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vehicle_appraisals_status_valido check (status in ('aperta', 'chiusa')),

  -- Nessun importo negativo: un costo negativo e' un errore di battitura, e
  -- passerebbe inosservato dentro una somma.
  constraint vehicle_appraisals_importi_non_negativi check (
    cost_body >= 0
    and cost_mechanical >= 0
    and cost_tyres >= 0
    and cost_interior >= 0
    and cost_other >= 0
    and coalesce(offered_price, 0) >= 0
    and coalesce(mileage, 0) >= 0
  ),

  -- Il rilievo e' un oggetto, non un numero o un elenco: una forma diversa
  -- vorrebbe dire che a scriverlo non e' stata la nostra schermata.
  constraint vehicle_appraisals_conditions_oggetto check (jsonb_typeof(conditions) = 'object')
);

create index if not exists vehicle_appraisals_dealer_idx
  on public.vehicle_appraisals (dealer_id, appraised_on desc);

-- Si cerca per targa quando il venditore richiama dopo una settimana.
create index if not exists vehicle_appraisals_dealer_plate_idx
  on public.vehicle_appraisals (dealer_id, upper(btrim(plate)));

create index if not exists vehicle_appraisals_vehicle_idx
  on public.vehicle_appraisals (vehicle_id)
  where vehicle_id is not null;

-- ============================================================
-- La concessionaria la mette il database
-- ============================================================
-- Chi scrive non puo' attribuire una perizia a un'altra concessionaria,
-- nemmeno per sbaglio. Quando a scrivere e' il servizio -- che non ha nessuna
-- concessionaria in sessione -- si accetta quella dichiarata: e' il caso degli
-- endpoint che girano sul server con la chiave di servizio.

create or replace function public.enforce_vehicle_appraisal_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
begin
  v_dealer_id := public.current_dealer_id();

  if new.dealer_id is null then
    if v_dealer_id is null then
      raise exception 'Nessuna concessionaria in sessione: la perizia non si puo'' attribuire'
        using errcode = '42501';
    end if;
    new.dealer_id := v_dealer_id;
  elsif v_dealer_id is not null and new.dealer_id <> v_dealer_id then
    raise exception 'La perizia non appartiene alla concessionaria collegata'
      using errcode = '42501';
  end if;

  -- Il veicolo agganciato, se c'e', deve essere della stessa concessionaria:
  -- altrimenti una perizia potrebbe puntare all'auto di un altro.
  if new.vehicle_id is not null then
    perform 1
      from public.vehicles v
     where v.id = new.vehicle_id
       and v.dealer_id = new.dealer_id;

    if not found then
      raise exception 'Il veicolo agganciato non e'' di questa concessionaria'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_vehicle_appraisal_dealer_id on public.vehicle_appraisals;

create trigger trg_enforce_vehicle_appraisal_dealer_id
  before insert or update on public.vehicle_appraisals
  for each row
  execute function public.enforce_vehicle_appraisal_dealer_id();

-- ============================================================
-- Chi ha diritto alle perizie
-- ============================================================
-- Dal Piano Pro in su, deciso dal titolare il 02/09/2026.
--
-- **La domanda non si fa su qualcun altro.** La funzione non accetta un
-- identificativo e risponde solo su chi sta chiedendo, ricavandolo da
-- `current_dealer_id()`. E' la forma che il progetto ha gia' adottato per il
-- conto economico (20260901040000) dopo un difetto vero: la versione con
-- l'identificativo era eseguibile da chiunque avesse fatto login, per
-- qualunque concessionaria, e una Base ha chiesto il piano di un'altra
-- ottenendo "elite". Gli identificativi delle concessionarie sono pubblici --
-- il marketplace li legge -- quindi bastava una sessione per farsi il listino
-- dei concorrenti.
--
-- Questa migration, nella sua prima stesura, quel difetto lo rifaceva
-- identico: `dealer_has_perizie(uuid)` concessa a `authenticated`. Provato su
-- un Postgres vero il 03/09/2026, rispondeva "true" sul piano di un'altra
-- concessionaria.
--
-- Una funzione separata da quella del conto economico, benche' oggi la soglia
-- sia la stessa: se un domani una delle due cambia piano, l'altra non deve
-- seguirla per sbaglio.
--
-- `security definer` perche' dentro deve leggere gli abbonamenti, riservati al
-- servizio: la chiamata annidata a `dealer_plan_in_force` avviene con i
-- privilegi del proprietario, quindi chi la invoca non ha bisogno di nessun
-- permesso su quella.

create or replace function public.current_dealer_has_perizie()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.dealer_plan_in_force(public.current_dealer_id()) in ('pro', 'elite'), false);
$$;

revoke all on function public.current_dealer_has_perizie() from public;
grant execute on function public.current_dealer_has_perizie() to authenticated, service_role;

-- ============================================================
-- Chi le vede
-- ============================================================
-- Solo chi ha fatto login, solo la propria concessionaria, e solo con il
-- piano giusto. Per `anon` non c'e' nessuna politica: la tabella e'
-- invisibile in blocco, e le perizie contengono nome e telefono di un privato.

alter table public.vehicle_appraisals enable row level security;
alter table public.vehicle_appraisals force row level security;

drop policy if exists vehicle_appraisals_select_own on public.vehicle_appraisals;
drop policy if exists vehicle_appraisals_insert_own on public.vehicle_appraisals;
drop policy if exists vehicle_appraisals_update_own on public.vehicle_appraisals;
drop policy if exists vehicle_appraisals_delete_own on public.vehicle_appraisals;

create policy vehicle_appraisals_select_own
on public.vehicle_appraisals
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and public.current_dealer_has_perizie()
);

create policy vehicle_appraisals_insert_own
on public.vehicle_appraisals
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and public.current_dealer_has_perizie()
);

create policy vehicle_appraisals_update_own
on public.vehicle_appraisals
for update
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and public.current_dealer_has_perizie()
)
with check (
  dealer_id = public.current_dealer_id()
  and public.current_dealer_has_perizie()
);

create policy vehicle_appraisals_delete_own
on public.vehicle_appraisals
for delete
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and public.current_dealer_has_perizie()
);

-- La cintura oltre alle bretelle: su Supabase una tabella nuova nello schema
-- pubblico riceve i permessi in automatico, e qui si tolgono a mano.
revoke all on public.vehicle_appraisals from anon;
grant select, insert, update, delete on public.vehicle_appraisals to authenticated;

-- Al servizio si concede esplicitamente invece di affidarsi ai permessi
-- automatici di Supabase: quelli si sono gia' persi una volta, in una
-- ricostruzione dello schema, e il guasto si manifesta lontano da qui.
grant select, insert, update, delete on public.vehicle_appraisals to service_role;

commit;
