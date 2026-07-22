-- New required-going-forward field: vehicle condition ("Condizioni").
-- Nullable at the schema level (existing rows have no value yet and must
-- not break), enforced as required in the dealer form and validated
-- in-app; a check constraint keeps the values consistent.

alter table public.vehicles
  add column if not exists vehicle_condition text;

alter table public.vehicles
  drop constraint if exists vehicles_vehicle_condition_check;

alter table public.vehicles
  add constraint vehicles_vehicle_condition_check
  check (vehicle_condition is null or vehicle_condition in ('Nuovo', 'Usato', 'Aziendale', 'Km/0'));

create index if not exists vehicles_vehicle_condition_idx on public.vehicles (vehicle_condition);
