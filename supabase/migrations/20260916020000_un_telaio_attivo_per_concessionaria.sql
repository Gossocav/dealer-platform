-- Una sola auto attiva per numero di telaio, dentro la stessa concessionaria.
--
-- E' la gemella di `20260916010000_una_targa_attiva_per_concessionaria.sql`,
-- e vale la stessa ragione: il telaio e' una chiave. Con quello si segna
-- venduta una vettura (`auto-da-chiudere.ts`), l'importazione da feed
-- riconosce un doppione cercando **prima per telaio**
-- (`findDuplicateVehicleId`), e domani si paghera' una decodifica. Due auto
-- con lo stesso telaio fanno credere al gestionale che siano la stessa.
--
-- **Perche' arriva dopo la targa, e non insieme.** In produzione il
-- 16/09/2026 due auto della stessa concessionaria portavano il telaio
-- `12345` -- un segnaposto -- e il telaio non aveva nessun controllo di
-- forma. L'ordine e' stato: prima la forma (`src/lib/telaio.ts`), poi la
-- pulizia dei due segnaposto (una `update` a parte, vista e applicata dal
-- titolare), poi questo indice. **Applicata prima della pulizia, questa
-- migration si ferma da sola**: Postgres rifiuta di creare un indice unico
-- su righe che lo violano, e lo dice nominando la chiave.
--
-- "Attiva" e' tutto cio' che non e' venduto ne' archiviato, per esclusione:
-- uno stato nuovo nasce protetto. La forma confrontata e' quella normalizzata,
-- la stessa di `normalizzaTelaio`.
--
-- Provata su Postgres 17 il 16/09/2026: con i due `12345` presenti si ferma
-- ("could not create unique index"); dopo la pulizia entra; doppione
-- rifiutato; venduta + attiva accettate; telai vuoti accettati.

begin;

create unique index if not exists vehicles_un_telaio_attivo_per_concessionaria
  on public.vehicles (dealer_id, upper(regexp_replace(vin, '[\s.\-_]', '', 'g')))
  where vin is not null and status not in ('sold', 'archived');

commit;
