-- Il gommista diventa una voce di costo, e sparisce la nota sull'"altro".
--
-- La nota chiedeva di spiegare a parole cosa fosse l'"altro costo", e il suo
-- esempio era proprio "gommatura". Nessuno l'ha mai compilata: al 31/08/2026
-- e' vuota su tutte le righe, compresa quella che ha 500 euro di "altro"
-- scritti dentro. Un campo che chiede di spiegare a parole una cifra non si
-- riempie: quella cifra si sposta in una voce che porta gia' il suo nome.
--
-- Le gomme sono la terza spesa ricorrente su un usato, dopo la lamiera e la
-- meccanica. Come per carrozzeria e officina, separata dice **dove** e' andato
-- il margine e sommata su tutto il parco dice se conviene comprare macchine
-- che arrivano con le gomme a terra.
--
-- La nota si toglie invece di lasciarla inutilizzata: una colonna che nessuno
-- scrive e nessuno legge diventa una domanda per chi la trovera' fra un anno.
-- Verificato prima di toglierla che sia vuota ovunque.
--
-- Le colonne calcolate vanno rifatte, come sempre: in PostgreSQL la formula di
-- una colonna generata non si altera, si toglie e si rimette.

begin;

alter table public.vehicle_economics
  add column if not exists cost_tyres numeric(12, 2) not null default 0;

alter table public.vehicle_economics
  drop column if exists cost_other_note;

alter table public.vehicle_economics drop column if exists total_cost;
alter table public.vehicle_economics drop column if exists margin;

alter table public.vehicle_economics
  add column total_cost numeric(12, 2) generated always as (
    coalesce(purchase_price, 0)
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
        + cost_transport + cost_bodywork + cost_workshop + cost_tyres
        + cost_preparation + cost_parts + cost_commission + cost_other
      )
    end
  ) stored;

alter table public.vehicle_economics
  drop constraint if exists vehicle_economics_importi_non_negativi;

alter table public.vehicle_economics
  add constraint vehicle_economics_importi_non_negativi
  check (
    coalesce(purchase_price, 0) >= 0
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
