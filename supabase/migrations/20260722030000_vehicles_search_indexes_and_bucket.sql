-- Performance indexes for the public marketplace search/catalog queries
-- (src/app/(marketplace)/ricerca/page.tsx, src/app/(marketplace)/auto/page.tsx).
-- Every public query filters on published = true first, so these are partial
-- indexes scoped to that condition: they stay small and fast as the table
-- grows toward the target scale (hundreds of dealers, ~200k vehicles), instead
-- of indexing rows (drafts, sold, unpublished) that public search never reads.

create extension if not exists pg_trgm;

-- Equality filters used by "Ricerca avanzata" and the catalog page.
create index if not exists vehicles_public_brand_idx on public.vehicles (brand) where published = true;
create index if not exists vehicles_public_model_idx on public.vehicles (model) where published = true;
create index if not exists vehicles_public_fuel_idx on public.vehicles (fuel) where published = true;
create index if not exists vehicles_public_transmission_idx on public.vehicles (transmission) where published = true;
create index if not exists vehicles_public_city_idx on public.vehicles (city) where published = true;
create index if not exists vehicles_public_province_idx on public.vehicles (province) where published = true;

-- Sort columns ("Ordinamento" / default feed order).
create index if not exists vehicles_public_created_at_idx on public.vehicles (created_at) where published = true;
create index if not exists vehicles_public_price_idx on public.vehicles (price) where published = true;
create index if not exists vehicles_public_registration_date_idx on public.vehicles (registration_date) where published = true;

-- Free-text search ("Cerca": ilike '%term%' on brand/model/version) can't use a
-- plain btree for a leading-wildcard match; trigram GIN indexes make it fast
-- at scale instead of degrading to a full sequential scan per keystroke.
create index if not exists vehicles_public_brand_trgm_idx on public.vehicles using gin (brand gin_trgm_ops) where published = true;
create index if not exists vehicles_public_model_trgm_idx on public.vehicles using gin (model gin_trgm_ops) where published = true;
create index if not exists vehicles_public_version_trgm_idx on public.vehicles using gin (version gin_trgm_ops) where published = true;

-- The "vehicle-images" bucket is referenced throughout the app (upload, signed
-- URLs, public URLs) but was never declared in a migration -- it only existed
-- because someone created it by hand in the Supabase dashboard at some point,
-- which means a fresh project (or a local schema reset) does not have it.
-- Declaring it here makes photo storage reproducible for any environment,
-- local or production.
-- **Privato**, e non pubblico come diceva questa riga fino al 05/09/2026.
--
-- In produzione il secchio e' privato, e il codice si comporta di
-- conseguenza: gli indirizzi delle fotografie li firma il server
-- (storageSigner in src/lib/public-marketplace.ts). Ma qui era dichiarato
-- `true`, quindi su un database ricostruito da zero -- un ambiente nuovo, un
-- ripristino dopo un guasto -- sarebbe nato pubblico. Un secchio pubblico si
-- scarica per indirizzo, senza firma e senza che nessuna regola lo fermi:
-- comprese le fotografie dei veicoli **non pubblicati**, che sono quelli su
-- cui una concessionaria sta ancora lavorando.
--
-- `do update` e non piu' `do nothing`: cosi' la riga non si limita a
-- descrivere l'intenzione, la applica anche a un secchio che esistesse gia'
-- aperto. Sulla produzione, dove e' gia' privato, non cambia niente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-images', 'vehicle-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
