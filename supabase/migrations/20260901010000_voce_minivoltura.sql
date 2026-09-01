-- La minivoltura diventa una voce di costo del conto economico.
--
-- Chiesta dal titolare il 01/09/2026. E' il passaggio di proprieta' che il
-- concessionario fa quando ritira la vettura, e ha un costo per ogni
-- automobile che entra in piazzale: finiva dentro "Altro" insieme a tutto il
-- resto, oppure fuori dal conto. Nel primo caso spariva dentro una cifra che
-- non dice di cosa e' fatta; nel secondo il margine risultava piu' alto del
-- vero su **ogni** vettura, perche' una spesa che c'e' sempre restava fuori
-- sempre.
--
-- Sta per prima fra i costi perche' e' la prima spesa in ordine di tempo:
-- viene con l'acquisto, prima ancora che l'automobile si muova.
--
-- Come per carrozzeria, officina e gommista, la voce separata risponde a una
-- domanda che il concessionario si fa davvero: sommata su tutto il parco dice
-- quanto costa in un anno la sola burocrazia del ritiro.
--
-- Nessuna riga esistente cambia valore: la colonna nasce a zero, e zero e'
-- quello che oggi contribuisce al totale. Chi vorra' completare i conti
-- passati riaprira' la scheda e scrivera' la cifra.
--
-- Le colonne calcolate vanno rifatte, come sempre: in PostgreSQL la formula di
-- una colonna generata non si altera, si toglie e si rimette.

begin;

alter table public.vehicle_economics
  add column if not exists cost_minivoltura numeric(12, 2) not null default 0;

alter table public.vehicle_economics drop column if exists total_cost;
alter table public.vehicle_economics drop column if exists margin;

alter table public.vehicle_economics
  add column total_cost numeric(12, 2) generated always as (
    coalesce(purchase_price, 0)
    + cost_minivoltura
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
        + cost_minivoltura
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
