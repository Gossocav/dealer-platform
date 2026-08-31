-- Due voci di costo in piu': carrozzeria e officina.
--
-- Sono le due spese piu' ricorrenti su un usato, e finivano schiacciate dentro
-- "preparazione" o dentro "altro". Separate servono a due cose diverse: sulla
-- singola vettura dicono **dove** e' andato il margine, e sommate su tutto il
-- parco dicono se conviene comprare macchine che hanno bisogno di lamiera
-- oppure di meccanica. Da un totale unico quell'informazione non si ricava
-- piu'.
--
-- **Le colonne calcolate vanno rifatte, non modificate.** In PostgreSQL una
-- colonna generata non si puo' alterare per cambiarne la formula: si toglie e
-- si rimette. Non si perde niente -- sono calcolate, non scritte -- ma
-- l'ordine conta: prima le colonne nuove, poi le formule che le sommano.
--
-- Nessun dato esistente viene toccato: le due voci nuove nascono a zero, e i
-- totali gia' calcolati restano identici finche' qualcuno non le compila.

begin;

alter table public.vehicle_economics
  add column if not exists cost_bodywork numeric(12, 2) not null default 0;

alter table public.vehicle_economics
  add column if not exists cost_workshop numeric(12, 2) not null default 0;

-- Le due somme, rifatte per comprendere le voci nuove.
alter table public.vehicle_economics drop column if exists total_cost;
alter table public.vehicle_economics drop column if exists margin;

alter table public.vehicle_economics
  add column total_cost numeric(12, 2) generated always as (
    coalesce(purchase_price, 0)
    + cost_transport + cost_bodywork + cost_workshop
    + cost_preparation + cost_parts + cost_commission + cost_other
  ) stored;

-- Il margine esiste solo dopo la vendita. Prima e' ignoto, non zero: zero
-- vorrebbe dire "venduta in pari", ed e' un'altra cosa.
alter table public.vehicle_economics
  add column margin numeric(12, 2) generated always as (
    case
      when sale_price is null then null
      else sale_price - (
        coalesce(purchase_price, 0)
        + cost_transport + cost_bodywork + cost_workshop
        + cost_preparation + cost_parts + cost_commission + cost_other
      )
    end
  ) stored;

-- Il vincolo comprende anche le voci nuove: un costo negativo e' un errore di
-- battitura, e passerebbe inosservato dentro una somma.
alter table public.vehicle_economics
  drop constraint if exists vehicle_economics_importi_non_negativi;

alter table public.vehicle_economics
  add constraint vehicle_economics_importi_non_negativi
  check (
    coalesce(purchase_price, 0) >= 0
    and cost_transport >= 0
    and cost_bodywork >= 0
    and cost_workshop >= 0
    and cost_preparation >= 0
    and cost_parts >= 0
    and cost_commission >= 0
    and cost_other >= 0
    and coalesce(sale_price, 0) >= 0
  );

commit;
