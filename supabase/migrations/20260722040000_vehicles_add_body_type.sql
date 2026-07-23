-- New required-going-forward field: vehicle body type ("Carrozzeria").
-- Nullable at the schema level (existing rows have no value yet and must
-- not break), enforced as required in the dealer form and validated
-- in-app; a check constraint keeps the values consistent.

alter table public.vehicles
  add column if not exists body_type text;

alter table public.vehicles
  drop constraint if exists vehicles_body_type_check;

alter table public.vehicles
  add constraint vehicles_body_type_check
  check (
    body_type is null or body_type in (
      'SUV/Pick-up', 'Berlina', 'Station Wagon', 'City Car',
      'Monovolume', 'Coupé', 'Cabrio', 'Furgone/Van'
    )
  );

create index if not exists vehicles_body_type_idx on public.vehicles (body_type) where published = true;
