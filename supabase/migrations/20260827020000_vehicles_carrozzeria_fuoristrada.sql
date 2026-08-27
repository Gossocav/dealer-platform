-- Il vincolo sulle carrozzerie era rimasto al nome vecchio.
--
-- Il 22/08/2026 "SUV/Pick-up" e' diventata "SUV/Pick-up/Fuoristrada" in
-- src/lib/vehicle-body-types.ts -- chi cercava un fuoristrada non lo trovava
-- nell'elenco. Il commento in quel file dice che il valore si poteva cambiare
-- senza toccare il database perche' nessun veicolo lo aveva salvato, ed era
-- vero per i **dati**: non per il **vincolo**, che e' rimasto ad ammettere
-- solo il nome vecchio.
--
-- Da allora il database rifiuta ogni veicolo con quella carrozzeria. Non e'
-- rimasto teorico:
--
-- - in produzione, il 27/08/2026, nessuna delle 149 automobili ha carrozzeria
--   SUV -- su un parco dove i SUV sono la maggioranza di cio' che si vende;
-- - riprovato su un Postgres vero, l'inserimento di una Jeep Avenger fallisce
--   con "violates check constraint vehicles_body_type_check";
-- - l'importazione dal sito della concessionaria scarta quelle vetture, ed e'
--   una delle ragioni per cui su KeyAuto mancano circa cento auto di una
--   concessionaria che vende soprattutto SUV.
--
-- Colpiva anche l'inserimento a mano: il modulo offre "SUV/Pick-up/Fuoristrada"
-- e il salvataggio falliva.

begin;

-- Prima i dati, poi il vincolo: se qualche riga avesse ancora il nome vecchio,
-- aggiungere il vincolo nuovo fallirebbe. In produzione non ce ne sono --
-- verificato il 27/08/2026 -- ma altrove si'.
update public.vehicles
set body_type = 'SUV/Pick-up/Fuoristrada'
where body_type = 'SUV/Pick-up';

alter table public.vehicles
  drop constraint if exists vehicles_body_type_check;

-- L'elenco e' lo stesso di VEHICLE_BODY_TYPES in
-- src/lib/vehicle-body-types.ts, e un test fallisce se i due divergono: e'
-- esattamente la divergenza che ha prodotto questo difetto.
alter table public.vehicles
  add constraint vehicles_body_type_check
  check (
    body_type is null or body_type in (
      'SUV/Pick-up/Fuoristrada', 'Berlina', 'Station Wagon', 'City Car',
      'Monovolume', 'Coupé', 'Cabrio', 'Furgone/Van'
    )
  );

commit;
