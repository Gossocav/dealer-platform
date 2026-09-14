-- Il costo totale non si inventa quando manca il prezzo di acquisto.
--
-- **In questo progetto un dato mancante non vale zero, in nessun calcolo.**
-- E' il terzo caso dello stesso errore:
--
-- 1. le "Ultime sincronizzazioni" mostravano due importazioni mai avvenute,
--    perche' un elenco vuoto veniva riempito con dati di esempio;
-- 2. il margine valeva il prezzo di vendita intero quando l'acquisto non era
--    scritto -- una vettura venduta a 11.500 senza acquisto risultava con
--    11.500 di margine, visto su una riga vera in produzione (31/08/2026);
-- 3. il costo totale sommava le altre voci ignorando l'acquisto mancante.
--
-- Il terzo e' rimasto in piedi perche' sembrava ragionevole: "dice quanto si
-- e' speso finora". Non lo e'. Su una vettura pagata 14.000 euro con 500 di
-- trasporto, "costo totale 500 euro" e' un numero plausibile e sbagliato di
-- quattordicimila, e chi legge lo schermo non ha nessun modo di accorgersene.
-- La voce che manca e' sempre la piu' grande di tutte.
--
-- La forma dell'errore e' sempre la stessa: **un numero plausibile al posto di
-- "non lo so"**.
--
-- Il campo scritto a **zero** resta un dato e il conto si fa: chi ha ricevuto
-- una vettura senza pagarla scrive 0. E' la differenza fra null e 0, ed e' la
-- stessa regola gia' scritta per il margine.
--
-- **Nessun dato viene toccato**: total_cost e' una colonna calcolata, non
-- scritta. Cambia solo cosa risponde. Le righe che hanno il prezzo di acquisto
-- -- cioe' tutte quelle su cui il numero contava davvero -- rispondono come
-- prima; le altre passano da un numero parziale a "non lo so".
--
-- Le colonne calcolate vanno rifatte: in PostgreSQL la formula di una colonna
-- generata non si altera, si toglie e si rimette. Il margine si rimette
-- identico a com'e' oggi, perche' se ci si scordasse di rimetterlo il conto
-- sparirebbe.

begin;

alter table public.vehicle_economics drop column if exists total_cost;
alter table public.vehicle_economics drop column if exists margin;

-- Senza prezzo di acquisto il costo totale e' ignoto, non parziale.
alter table public.vehicle_economics
  add column total_cost numeric(12, 2) generated always as (
    case
      when purchase_price is null then null
      else purchase_price
        + cost_minivoltura + cost_bollo
        + cost_transport + cost_bodywork + cost_workshop + cost_tyres
        + cost_preparation + cost_parts + cost_commission + cost_other
    end
  ) stored;

-- Il margine esige tutte e due le cifre: identico a prima.
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

commit;
