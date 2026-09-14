-- La variante che NON blocca le tabelle, per il giorno che saranno grandi.
--
-- **Non ha `begin` e `commit`, e non e' una dimenticanza**: PostgreSQL rifiuta
-- `create index concurrently` dentro una transazione. Il prezzo e' che le
-- istruzioni non sono piu' tutto-o-niente: se una fallisce, le precedenti
-- restano fatte. Si rilancia: `if not exists` salta quelle gia' create.
--
-- Un secondo prezzo, meno noto: un `create index concurrently` che fallisce
-- lascia un indice **non valido** con lo stesso nome, e `if not exists` lo
-- considera esistente. Dopo un errore si controlla:
--
--     select indexrelid::regclass from pg_index where not indisvalid;
--
-- e quelli che compaiono si cancellano prima di rilanciare.
--
-- Al 14/09/2026 questa variante non serve: 372 auto e 4.779 fotografie si
-- indicizzano in un istante. Sta qui per quando non sara' piu' vero.

create index concurrently if not exists vehicles_dealer_id_idx on public.vehicles using btree (dealer_id);
create index concurrently if not exists vehicles_published_idx on public.vehicles using btree (published);
create index concurrently if not exists vehicles_status_idx    on public.vehicles using btree (status);
create index concurrently if not exists vehicle_images_vehicle_id_idx on public.vehicle_images using btree (vehicle_id);
create index concurrently if not exists vehicle_images_cover_idx      on public.vehicle_images using btree (vehicle_id, is_cover);
create index concurrently if not exists vehicle_images_dealer_id_idx  on public.vehicle_images using btree (dealer_id);
create index concurrently if not exists idx_demo_requests_status     on public.demo_requests using btree (status);
create index concurrently if not exists idx_demo_requests_created_at on public.demo_requests using btree (created_at desc);
