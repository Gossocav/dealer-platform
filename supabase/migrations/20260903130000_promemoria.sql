-- I promemoria: cosa scade e cosa c'e' da fare.
--
-- Chiesti dal titolare il 03/09/2026: le scadenze dei documenti dell'auto, il
-- bollo, richiamare una lead, richiamare il cliente dopo un preventivo.
--
-- **Il problema non era avvisare, era che non c'era niente da avvisare.**
-- Verificato prima di scrivere questa migration: nel database non esisteva
-- nessuna data di scadenza -- ne' revisione, ne' assicurazione, ne' garanzia.
-- I documenti hanno la data *del* documento, non quella in cui scadono; le
-- lead hanno solo uno stato, senza un "richiamare il". L'unica scadenza
-- esistente era il bollo, aggiunto poche ore prima. Un sistema di promemoria
-- costruito su quel vuoto sarebbe stato una sveglia senza orologio.
--
-- **Una tabella sola per tutto.** Una scadenza della revisione e un "richiamare
-- Rossi giovedi'" sono la stessa cosa per chi li riceve: una riga con una data
-- che a un certo punto arriva. Tabelle separate per tipo vorrebbero dire
-- ripetere tre volte le politiche di sicurezza, tre volte la lettura, e tre
-- elenchi da unire ogni mattina per mandare una email sola.
--
-- **Il legame con la vettura si cancella a cascata, al contrario dei
-- documenti.** E' la differenza fra un documento e un promemoria: un contratto
-- di vendita si conserva dieci anni anche se l'auto sparisce dall'elenco
-- (20260903100000), mentre "la revisione di quella macchina scade in marzo"
-- non vuol dire piu' niente quando quella macchina non c'e' piu'. Ricordarlo
-- sarebbe rumore, e il rumore su un promemoria e' fatale: dopo tre avvisi
-- inutili non si guarda piu' nemmeno quelli veri.
--
-- **Nessuna soglia di piano**: le scadenze le ha chiunque venda automobili.
--
-- Il bollo resta dov'e', nel conto economico, e **non si duplica qui**: e' una
-- voce di costo con una data, e due posti dove scrivere la stessa scadenza
-- divergerebbero al primo che ne corregge uno solo. Il lavoro che manda l'email
-- lo leggera' da li'. Conseguenza da sapere: il conto economico e' del Piano
-- Pro, quindi il promemoria del bollo lo avranno i Pro e gli Elite.
--
-- Provata su un Postgres 15 vero prima di spedirla.

begin;

create table if not exists public.promemoria (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,

  tipo text not null default 'altro',
  titolo text,
  note text,

  -- Il giorno in cui va fatto, o in cui scade. E' l'unico campo davvero
  -- obbligatorio: un promemoria senza data non e' un promemoria, e' un appunto.
  scade_il date not null,

  -- A cosa si riferisce. Tutti facoltativi: "richiamare il commercialista" non
  -- riguarda nessuna vettura e nessun cliente.
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,

  stato text not null default 'aperto',
  fatto_il timestamptz,

  -- L'ultimo giorno in cui e' finito nell'email del mattino. Serve a non
  -- mandarlo due volte lo stesso giorno se il lavoro gira piu' di una volta.
  avvisato_il date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint promemoria_tipo_valido check (tipo in (
    'revisione',
    'assicurazione',
    'tagliando',
    'garanzia',
    'richiamo_lead',
    'richiamo_cliente',
    'preventivo',
    'altro'
  )),

  constraint promemoria_stato_valido check (stato in ('aperto', 'fatto')),

  -- Un promemoria fatto ha il giorno in cui e' stato fatto, e uno aperto no:
  -- senza questo vincolo si accumulano righe "fatte" senza sapere quando, che
  -- e' il modo piu' rapido per non fidarsi piu' dell'elenco.
  constraint promemoria_fatto_ha_una_data check (
    (stato = 'fatto' and fatto_il is not null)
    or (stato = 'aperto' and fatto_il is null)
  )
);

-- La domanda di ogni mattina: cosa scade oggi, per questa concessionaria.
create index if not exists promemoria_dealer_scadenza_idx
  on public.promemoria (dealer_id, scade_il)
  where stato = 'aperto';

create index if not exists promemoria_veicolo_idx
  on public.promemoria (vehicle_id)
  where vehicle_id is not null;

create index if not exists promemoria_lead_idx
  on public.promemoria (lead_id)
  where lead_id is not null;

-- Una scadenza per tipo su ogni vettura: la revisione scade una volta sola, e
-- due righe aperte vorrebbero dire due avvisi per la stessa cosa. "Altro" resta
-- fuori dal vincolo, perche' di appunti su una stessa auto se ne prendono
-- quanti se ne vuole.
create unique index if not exists promemoria_una_scadenza_per_tipo
  on public.promemoria (vehicle_id, tipo)
  where vehicle_id is not null and stato = 'aperto' and tipo <> 'altro';

-- ============================================================
-- La concessionaria la mette il database
-- ============================================================

create or replace function public.enforce_promemoria_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
  v_altro uuid;
begin
  v_dealer_id := public.current_dealer_id();

  if new.dealer_id is null then
    if v_dealer_id is null then
      raise exception 'Nessuna concessionaria in sessione: il promemoria non si puo'' attribuire'
        using errcode = '42501';
    end if;
    new.dealer_id := v_dealer_id;
  elsif v_dealer_id is not null and new.dealer_id <> v_dealer_id then
    raise exception 'Il promemoria non appartiene alla concessionaria collegata'
      using errcode = '42501';
  end if;

  -- Un promemoria non puo' puntare alla vettura, alla lead o al cliente di
  -- un'altra concessionaria: sarebbe una fessura da cui si legge il nome di
  -- quello che non si dovrebbe vedere.
  if new.vehicle_id is not null then
    select v.dealer_id into v_altro from public.vehicles v where v.id = new.vehicle_id;
    if not found or v_altro <> new.dealer_id then
      raise exception 'Il veicolo non e'' di questa concessionaria' using errcode = '42501';
    end if;
  end if;

  if new.lead_id is not null then
    select l.dealer_id into v_altro from public.leads l where l.id = new.lead_id;
    if not found or v_altro <> new.dealer_id then
      raise exception 'La lead non e'' di questa concessionaria' using errcode = '42501';
    end if;
  end if;

  if new.customer_id is not null then
    select c.dealer_id into v_altro from public.customers c where c.id = new.customer_id;
    if not found or v_altro <> new.dealer_id then
      raise exception 'Il cliente non e'' di questa concessionaria' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_promemoria_dealer_id on public.promemoria;

create trigger trg_enforce_promemoria_dealer_id
  before insert or update on public.promemoria
  for each row
  execute function public.enforce_promemoria_dealer_id();

-- ============================================================
-- Chi li vede
-- ============================================================

alter table public.promemoria enable row level security;
alter table public.promemoria force row level security;

drop policy if exists promemoria_select_own on public.promemoria;
drop policy if exists promemoria_insert_own on public.promemoria;
drop policy if exists promemoria_update_own on public.promemoria;
drop policy if exists promemoria_delete_own on public.promemoria;

create policy promemoria_select_own
on public.promemoria
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy promemoria_insert_own
on public.promemoria
for insert
to authenticated
with check (dealer_id = public.current_dealer_id());

create policy promemoria_update_own
on public.promemoria
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy promemoria_delete_own
on public.promemoria
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

revoke all on public.promemoria from anon;
grant select, insert, update, delete on public.promemoria to authenticated;

-- Il lavoro che manda l'email del mattino gira sul server con la chiave di
-- servizio: legge i promemoria di tutte le concessionarie e segna quali ha
-- gia' avvisato.
grant select, insert, update, delete on public.promemoria to service_role;

commit;
