-- "Ordinamento" gains "Km crescente"/"Km decrescente" on /ricerca and /auto,
-- alongside the already-indexed price/date/registration_date sort columns.
-- Same partial-index pattern (WHERE published = true) as the rest of the
-- public search sort columns, so this stays fast at scale too.

create index if not exists vehicles_public_mileage_idx on public.vehicles (mileage) where published = true;
