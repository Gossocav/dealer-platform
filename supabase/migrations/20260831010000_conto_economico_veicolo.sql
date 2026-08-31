-- Il conto economico di un veicolo: quanto e' costato, quanto ha reso.
--
-- E' il dato che oggi manca del tutto. Misurato in produzione il 31/08/2026:
-- delle 251 automobili pubblicate, nessuna ha un prezzo di acquisto, un costo
-- o un margine, perche' non esistono le colonne per scriverli. Il
-- concessionario non puo' sapere quanto ha guadagnato su una vettura, ne'
-- quanto guadagna in un mese: quel conto resta nel suo Excel, e finche' resta
-- li' il nostro non e' il programma su cui decide.
--
-- **Perche' una tabella a parte e non altre colonne su `vehicles`.**
-- La protezione per riga nasconde le righe, non le colonne, e `vehicles` deve
-- restare pubblica perche' e' il marketplace: qualunque colonna aggiunta li'
-- sarebbe leggibile con la chiave del sito, come si e' visto il 31/08 con il
-- telaio e con il piano delle concessionarie
-- (20260831000000_colonne_riservate_non_pubbliche.sql).
--
-- Una tabella nuova, invece, non ha nessuna politica per `anon`: e' invisibile
-- **in blocco**, e non c'e' nessuna colonna da ricordarsi di escludere. E' lo
-- stesso schema con cui gia' oggi clienti, richieste e appuntamenti non si
-- vedono da fuori.
--
-- **Le voci di costo sono separate** e non un totale unico: un concessionario
-- che vede "3.200 euro di costi" non sa dove intervenire, uno che vede
-- "trasporto 400, preparazione 1.900, ricambi 700, provvigione 200" lo sa. E
-- separate si possono sommare per capire dove se ne va il margine su tutto il
-- parco, cosa che da un totale unico non si ricava piu'.
--
-- Il totale e il margine sono **colonne calcolate dal database**, non numeri
-- scritti dall'applicazione: cosi' non possono restare indietro rispetto alle
-- voci da cui derivano. Il margine e' nullo finche' l'auto non e' venduta --
-- non zero: zero vorrebbe dire "venduta in pari", ed e' un'altra cosa.

begin;

create table if not exists public.vehicle_economics (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  dealer_id uuid not null references public.dealers(id) on delete cascade,

  -- L'acquisto
  purchase_price numeric(12, 2),
  purchase_date date,
  supplier text,

  -- Le voci di costo, separate
  cost_transport numeric(12, 2) not null default 0,
  cost_preparation numeric(12, 2) not null default 0,
  cost_parts numeric(12, 2) not null default 0,
  cost_commission numeric(12, 2) not null default 0,
  cost_other numeric(12, 2) not null default 0,
  cost_other_note text,

  -- La vendita
  sale_price numeric(12, 2),
  sale_date date,

  notes text,

  -- Quanto e' costata in tutto: acquisto piu' tutte le voci.
  total_cost numeric(12, 2) generated always as (
    coalesce(purchase_price, 0)
    + cost_transport + cost_preparation + cost_parts + cost_commission + cost_other
  ) stored,

  -- Il margine esiste solo dopo la vendita. Prima e' ignoto, non zero.
  margin numeric(12, 2) generated always as (
    case
      when sale_price is null then null
      else sale_price - (
        coalesce(purchase_price, 0)
        + cost_transport + cost_preparation + cost_parts + cost_commission + cost_other
      )
    end
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nessun importo negativo: un costo negativo e' un errore di battitura, e
-- passerebbe inosservato dentro una somma.
alter table public.vehicle_economics
  drop constraint if exists vehicle_economics_importi_non_negativi;

alter table public.vehicle_economics
  add constraint vehicle_economics_importi_non_negativi
  check (
    coalesce(purchase_price, 0) >= 0
    and cost_transport >= 0
    and cost_preparation >= 0
    and cost_parts >= 0
    and cost_commission >= 0
    and cost_other >= 0
    and coalesce(sale_price, 0) >= 0
  );

create index if not exists vehicle_economics_dealer_id_idx
  on public.vehicle_economics (dealer_id);

-- Il conto del mese si chiede sempre per data di vendita.
create index if not exists vehicle_economics_dealer_sale_date_idx
  on public.vehicle_economics (dealer_id, sale_date desc);

-- ============================================================
-- La concessionaria non si dichiara: si ricava dal veicolo
-- ============================================================
-- Stesso principio del trigger che gia' vigila su `vehicles`. Chi scrive non
-- puo' attribuire il conto economico di un'auto a un'altra concessionaria,
-- nemmeno per sbaglio: il valore giusto lo mette il database, e uno sbagliato
-- lo rifiuta invece di correggerlo in silenzio.

create or replace function public.enforce_vehicle_economics_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
begin
  select v.dealer_id into v_dealer_id
  from public.vehicles v
  where v.id = new.vehicle_id;

  if v_dealer_id is null then
    raise exception 'Veicolo inesistente o senza concessionaria: %', new.vehicle_id
      using errcode = '23503';
  end if;

  if new.dealer_id is null then
    new.dealer_id := v_dealer_id;
  elsif new.dealer_id <> v_dealer_id then
    raise exception 'Il conto economico non appartiene alla concessionaria del veicolo'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_vehicle_economics_dealer_id on public.vehicle_economics;

create trigger trg_enforce_vehicle_economics_dealer_id
  before insert or update on public.vehicle_economics
  for each row
  execute function public.enforce_vehicle_economics_dealer_id();

-- ============================================================
-- Chi lo vede
-- ============================================================
-- Solo chi ha fatto login, e solo la propria concessionaria. Per `anon` non
-- c'e' nessuna politica: la tabella e' invisibile in blocco.

alter table public.vehicle_economics enable row level security;
alter table public.vehicle_economics force row level security;

drop policy if exists vehicle_economics_select_own on public.vehicle_economics;
drop policy if exists vehicle_economics_insert_own on public.vehicle_economics;
drop policy if exists vehicle_economics_update_own on public.vehicle_economics;
drop policy if exists vehicle_economics_delete_own on public.vehicle_economics;

create policy vehicle_economics_select_own
on public.vehicle_economics
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy vehicle_economics_insert_own
on public.vehicle_economics
for insert
to authenticated
with check (dealer_id = public.current_dealer_id());

create policy vehicle_economics_update_own
on public.vehicle_economics
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy vehicle_economics_delete_own
on public.vehicle_economics
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- La cintura, oltre alle bretelle. Su Supabase una tabella nuova nello schema
-- pubblico riceve i permessi in automatico: qui si tolgono a mano, cosi' se un
-- domani qualcuno spegnesse la protezione per riga la tabella resterebbe
-- comunque chiusa al pubblico.
revoke all on public.vehicle_economics from anon;
grant select, insert, update, delete on public.vehicle_economics to authenticated;

commit;
