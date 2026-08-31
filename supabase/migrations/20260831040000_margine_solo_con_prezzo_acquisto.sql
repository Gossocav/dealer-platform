-- Il margine esiste solo se si sa **anche** quanto e' costata.
--
-- Finora nasceva appena c'era il prezzo di vendita, e il prezzo d'acquisto
-- mancante valeva zero. Su una vettura venduta a 11.500 senza acquisto scritto
-- il conto diceva "margine 11.500": formalmente coerente, e completamente
-- falso. Visto in produzione il 31/08/2026 su una riga vera, e nelle
-- statistiche quella cifra gonfiava il totale del mese e la marginalita'
-- media senza che si potesse capire da dove venisse.
--
-- E' lo stesso principio gia' applicato al prezzo di vendita, portato
-- dall'altra parte del conto: **un dato che manca non vale zero**. Un acquisto
-- non scritto non e' un'auto regalata.
--
-- La distinzione fra "non scritto" e "zero" resta possibile: chi ha davvero
-- avuto un costo d'acquisto nullo scrive 0, e il margine si calcola. E' la
-- differenza fra il campo vuoto e il campo con dentro uno zero, che nel
-- database e' la differenza fra null e 0.
--
-- Il costo totale invece non cambia: resta la somma di cio' che e' scritto,
-- che e' una risposta onesta anche quando l'acquisto manca -- dice quanto si
-- e' speso finora, non quanto vale l'automobile.
--
-- Le statistiche non vanno toccate: gia' escludono le righe senza margine, e
-- ne contano il numero a parte. La correzione si propaga da sola ai totali del
-- mese, alle medie e alle classifiche.
--
-- Effetto sui dati esistenti: le righe con un prezzo di vendita ma senza
-- prezzo d'acquisto passano da un margine numerico a nessun margine. Non si
-- perde niente -- e' una colonna calcolata -- e quel numero era sbagliato.

begin;

alter table public.vehicle_economics drop column if exists margin;

alter table public.vehicle_economics
  add column margin numeric(12, 2) generated always as (
    case
      when sale_price is null or purchase_price is null then null
      else sale_price - (
        purchase_price
        + cost_transport + cost_bodywork + cost_workshop
        + cost_preparation + cost_parts + cost_commission + cost_other
      )
    end
  ) stored;

commit;
