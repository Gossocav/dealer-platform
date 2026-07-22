-- New required-going-forward field: distinguishes "Auto" from "Veicolo
-- commerciale". Nullable at the schema level (existing rows have no value
-- yet and must not break), enforced as required in the dealer form and
-- validated in-app; a check constraint keeps the two values consistent.

alter table public.vehicles
  add column if not exists vehicle_category text;

alter table public.vehicles
  drop constraint if exists vehicles_vehicle_category_check;

alter table public.vehicles
  add constraint vehicles_vehicle_category_check
  check (vehicle_category is null or vehicle_category in ('Auto', 'Veicolo commerciale'));

create index if not exists vehicles_vehicle_category_idx on public.vehicles (vehicle_category);
