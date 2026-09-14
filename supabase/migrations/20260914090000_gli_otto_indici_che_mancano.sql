-- Gli otto indici che i file hanno e la produzione no.
--
-- **Stanno in una migration da soli**, separati da tutto il resto: se uno
-- andasse storto non si porta dietro nessun'altra modifica.
--
-- **Non cambiano il comportamento di niente.** Un indice non altera nessun
-- dato e nessuna risposta: cambia solo quanto ci mette il database a trovarle.
-- Tre di questi pero' pesano sul cuore del prodotto:
--
--     vehicles_dealer_id_idx      ogni pagina del gestionale filtra per concessionaria
--     vehicles_published_idx      il marketplace e il tetto del piano contano le pubblicate
--     vehicle_images_vehicle_id_idx   ogni scheda chiede le foto della sua vettura
--
-- **Perche' adesso e non dopo.** Con 372 auto e 4.779 fotografie la creazione
-- dura secondi e la tabella resta occupata per un istante. Con diecimila auto
-- la stessa operazione tiene occupata la tabella molto piu' a lungo, e in
-- orario di lavoro si vede.
--
-- **Perche' non "concurrently".** Sarebbe il modo per non bloccare la tabella,
-- ma PostgreSQL non permette `create index concurrently` dentro una
-- transazione: o si rinuncia a `begin`/`commit` -- e allora un errore a meta'
-- lascia le cose fatte a meta' -- oppure si accetta un blocco di qualche
-- istante. Su questi volumi il blocco e' preferibile, perche' e' brevissimo e
-- tutto o niente. Il giorno che le tabelle saranno grandi, la scelta si
-- capovolge, e la versione senza transazione sta in
-- `supabase/ritorni/20260914090000_senza_bloccare.sql`.
--
-- `if not exists` su ognuno: se qualcuno ne avesse gia' creato uno a mano,
-- questa migration non se ne accorge nemmeno.

begin;

-- Il gestionale: ogni elenco filtra per concessionaria.
create index if not exists vehicles_dealer_id_idx on public.vehicles using btree (dealer_id);

-- Il marketplace e il tetto del piano: "quante ne ho in vetrina".
create index if not exists vehicles_published_idx on public.vehicles using btree (published);
create index if not exists vehicles_status_idx    on public.vehicles using btree (status);

-- Le fotografie: la scheda chiede quelle della sua vettura, la copertina per
-- prima, e il gestionale le conta per concessionaria.
create index if not exists vehicle_images_vehicle_id_idx on public.vehicle_images using btree (vehicle_id);
create index if not exists vehicle_images_cover_idx      on public.vehicle_images using btree (vehicle_id, is_cover);
create index if not exists vehicle_images_dealer_id_idx  on public.vehicle_images using btree (dealer_id);

-- Il pannello amministrativo: le richieste di prova, per stato e per data.
create index if not exists idx_demo_requests_status     on public.demo_requests using btree (status);
create index if not exists idx_demo_requests_created_at on public.demo_requests using btree (created_at desc);

commit;
