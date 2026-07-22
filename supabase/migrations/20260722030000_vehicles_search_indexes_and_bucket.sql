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
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-images', 'vehicle-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
