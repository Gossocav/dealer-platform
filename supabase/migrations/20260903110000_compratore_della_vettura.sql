-- Chi ha comprato la vettura.
--
-- Chiesto dal titolare il 03/09/2026: quando una vettura passa a "venduta",
-- deve restare archiviato a chi e' stata venduta -- nome e cognome o ragione
-- sociale, email, telefono, indirizzo.
--
-- **Il pezzo che mancava non era il posto, era il gesto.** La rubrica clienti
-- esiste dal 27/06/2026 con tutti i campi giusti, e su `vehicles` c'e' persino
-- una colonna `customer_id` per collegarla. Solo che non la scrive nessuna
-- schermata: misurato in produzione il 03/09/2026, su 275 vetture **zero**
-- hanno un cliente collegato, e mettere una vettura in "venduta" non chiede
-- niente.
--
-- **Perche' i dati del compratore si copiano invece di essere solo
-- collegati.** Un collegamento dice chi e' quel cliente *oggi*: se fra due anni
-- cambia indirizzo, o viene cancellato dalla rubrica, la vendita cambierebbe
-- insieme a lui o resterebbe senza nome. Una vendita e' un fatto avvenuto in
-- un giorno preciso, e va conservata com'era. Il collegamento resta comunque,
-- per ritrovare il cliente in rubrica: sono due cose diverse e ci sono
-- tutte e due.
--
-- **Nessuna soglia di piano**: vendere e' di tutti. Il prezzo di vendita non
-- sta qui ma nel conto economico (Piano Pro), dove c'era gia': due prezzi in
-- due posti prima o poi divergono.
--
-- Come per i documenti (20260903100000), il legame con la vettura si spezza
-- senza portarsi via la riga, e la targa resta scritta sulla vendita.
--
-- Provata su un Postgres 15 vero prima di spedirla.

begin;

create table if not exists public.vehicle_sales (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,

  vehicle_id uuid references public.vehicles(id) on delete set null,
  vehicle_plate text,
  vehicle_label text,

  -- Il cliente in rubrica, se c'e'. Si perde se viene cancellato, e la copia
  -- qui sotto e' quello che resta.
  customer_id uuid references public.customers(id) on delete set null,

  -- Il compratore com'era il giorno della vendita
  buyer_first_name text,
  buyer_last_name text,
  buyer_company text,
  buyer_vat_number text,
  buyer_tax_code text,
  buyer_email text,
  buyer_phone text,
  buyer_address text,
  buyer_zip_code text,
  buyer_city text,
  buyer_province text,

  sold_on date not null default current_date,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un compratore senza nessun nome non e' un compratore: sarebbe una riga
  -- che dice "venduta a qualcuno", cioe' quello che c'era prima.
  constraint vehicle_sales_ha_un_nome check (
    coalesce(btrim(buyer_first_name), '') <> ''
    or coalesce(btrim(buyer_last_name), '') <> ''
    or coalesce(btrim(buyer_company), '') <> ''
  )
);

-- Una vendita per vettura. L'indice e' parziale perche' le vendite di vetture
-- cancellate restano, tutte con `vehicle_id` nullo: un vincolo pieno le
-- considererebbe doppioni fra loro.
create unique index if not exists vehicle_sales_una_per_vettura
  on public.vehicle_sales (vehicle_id)
  where vehicle_id is not null;

create index if not exists vehicle_sales_dealer_idx
  on public.vehicle_sales (dealer_id, sold_on desc);

create index if not exists vehicle_sales_cliente_idx
  on public.vehicle_sales (customer_id)
  where customer_id is not null;

-- Si cerca per targa anche quando la vettura non c'e' piu'.
create index if not exists vehicle_sales_targa_idx
  on public.vehicle_sales (dealer_id, upper(btrim(vehicle_plate)));

-- ============================================================
-- La concessionaria la mette il database; vettura e cliente si controllano
-- ============================================================

create or replace function public.enforce_vehicle_sale_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
  v_veicolo record;
  v_cliente_dealer uuid;
begin
  v_dealer_id := public.current_dealer_id();

  if new.dealer_id is null then
    if v_dealer_id is null then
      raise exception 'Nessuna concessionaria in sessione: la vendita non si puo'' attribuire'
        using errcode = '42501';
    end if;
    new.dealer_id := v_dealer_id;
  elsif v_dealer_id is not null and new.dealer_id <> v_dealer_id then
    raise exception 'La vendita non appartiene alla concessionaria collegata'
      using errcode = '42501';
  end if;

  if new.vehicle_id is not null then
    select v.dealer_id, v.plate, v.brand, v.model, v.version
      into v_veicolo
      from public.vehicles v
     where v.id = new.vehicle_id;

    if not found or v_veicolo.dealer_id <> new.dealer_id then
      raise exception 'Il veicolo non e'' di questa concessionaria'
        using errcode = '42501';
    end if;

    new.vehicle_plate := coalesce(nullif(btrim(v_veicolo.plate), ''), new.vehicle_plate);
    new.vehicle_label := nullif(btrim(concat_ws(' ', v_veicolo.brand, v_veicolo.model, v_veicolo.version)), '');
  end if;

  if new.customer_id is not null then
    select c.dealer_id into v_cliente_dealer
      from public.customers c
     where c.id = new.customer_id;

    if not found or v_cliente_dealer <> new.dealer_id then
      raise exception 'Il cliente non e'' di questa concessionaria'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_vehicle_sale_dealer_id on public.vehicle_sales;

create trigger trg_enforce_vehicle_sale_dealer_id
  before insert or update on public.vehicle_sales
  for each row
  execute function public.enforce_vehicle_sale_dealer_id();

-- ============================================================
-- Chi le vede
-- ============================================================
-- Solo chi ha fatto login, solo la propria concessionaria, nessuna soglia di
-- piano. Per `anon` non c'e' nessuna politica: qui dentro ci sono nome,
-- indirizzo e telefono di privati cittadini.

alter table public.vehicle_sales enable row level security;
alter table public.vehicle_sales force row level security;

drop policy if exists vehicle_sales_select_own on public.vehicle_sales;
drop policy if exists vehicle_sales_insert_own on public.vehicle_sales;
drop policy if exists vehicle_sales_update_own on public.vehicle_sales;
drop policy if exists vehicle_sales_delete_own on public.vehicle_sales;

create policy vehicle_sales_select_own
on public.vehicle_sales
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy vehicle_sales_insert_own
on public.vehicle_sales
for insert
to authenticated
with check (dealer_id = public.current_dealer_id());

create policy vehicle_sales_update_own
on public.vehicle_sales
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy vehicle_sales_delete_own
on public.vehicle_sales
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

revoke all on public.vehicle_sales from anon;
grant select, insert, update, delete on public.vehicle_sales to authenticated;
grant select, insert, update, delete on public.vehicle_sales to service_role;

commit;
