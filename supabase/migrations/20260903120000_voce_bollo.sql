-- Il bollo diventa una voce del conto economico, con la sua scadenza.
--
-- Chiesto dal titolare il 03/09/2026. Come minivoltura, carrozzeria, officina
-- e gommista: una spesa che sull'usato c'e' quasi sempre e che finiva dentro
-- "Altro" o fuori dal conto. Nel primo caso spariva dentro una cifra che non
-- dice di cosa e' fatta; nel secondo il margine risultava piu' alto del vero.
--
-- **Ma il bollo, a differenza delle altre voci, ha una data.** E' l'unica
-- spesa del conto che non si esaurisce quando e' pagata: continua a scadere.
-- Una vettura in piazzale col bollo scaduto non si puo' portare in prova su
-- strada, e quando si vende il compratore se ne accorge subito. Per questo
-- accanto all'importo c'e' `bollo_expires_on`, e la schermata scrive "Scade
-- il" o "Scaduto il" a seconda di dov'e' finita quella data rispetto a oggi.
--
-- **La data non ha valore predefinito e resta vuota**: un bollo di cui non si
-- conosce la scadenza non e' un bollo scaduto, ed e' un'altra cosa da un bollo
-- valido. Riempirla con una data qualunque sarebbe inventare un dato, e su 275
-- vetture nessuno andrebbe a controllarlo.
--
-- Nessuna riga esistente cambia valore: la colonna dell'importo nasce a zero,
-- e zero e' quello che oggi contribuisce al totale.
--
-- Le colonne calcolate vanno rifatte, come sempre: in PostgreSQL la formula di
-- una colonna generata non si altera, si toglie e si rimette.

begin;

alter table public.vehicle_economics
  add column if not exists cost_bollo numeric(12, 2) not null default 0;

alter table public.vehicle_economics
  add column if not exists bollo_expires_on date;

comment on column public.vehicle_economics.bollo_expires_on is
  'Quando scade il bollo di questa vettura. Vuota quando non si sa: un bollo di cui non si conosce la scadenza non e'' un bollo scaduto.';

alter table public.vehicle_economics drop column if exists total_cost;
alter table public.vehicle_economics drop column if exists margin;

alter table public.vehicle_economics
  add column total_cost numeric(12, 2) generated always as (
    coalesce(purchase_price, 0)
    + cost_minivoltura + cost_bollo
    + cost_transport + cost_bodywork + cost_workshop + cost_tyres
    + cost_preparation + cost_parts + cost_commission + cost_other
  ) stored;

-- Il margine esige tutte e due le cifre: senza prezzo di vendita non si sa
-- quanto ha reso, senza prezzo di acquisto non si sa quanto e' costata.
alter table public.vehicle_economics
  add column margin numeric(12, 2) generated always as (
    case
      when sale_price is null or purchase_price is null then null
      else sale_price - (
        purchase_price
        + cost_minivoltura + cost_bollo
        + cost_transport + cost_bodywork + cost_workshop + cost_tyres
        + cost_preparation + cost_parts + cost_commission + cost_other
      )
    end
  ) stored;

-- Un costo negativo e' un errore di battitura, e passerebbe inosservato dentro
-- una somma.
alter table public.vehicle_economics
  drop constraint if exists vehicle_economics_importi_non_negativi;

alter table public.vehicle_economics
  add constraint vehicle_economics_importi_non_negativi
  check (
    coalesce(purchase_price, 0) >= 0
    and cost_minivoltura >= 0
    and cost_bollo >= 0
    and cost_transport >= 0
    and cost_bodywork >= 0
    and cost_workshop >= 0
    and cost_tyres >= 0
    and cost_preparation >= 0
    and cost_parts >= 0
    and cost_commission >= 0
    and cost_other >= 0
    and coalesce(sale_price, 0) >= 0
  );

commit;
