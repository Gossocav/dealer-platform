-- Add dealer_id column to vehicle_images table and populate from vehicles
-- This ensures images are properly scoped by dealer for RLS policies

begin;

-- 1. Add dealer_id column if it doesn't exist (nullable initially)
alter table public.vehicle_images
add column if not exists dealer_id uuid;

-- 2. Populate dealer_id from the connected vehicle records
update public.vehicle_images vi
set dealer_id = v.dealer_id
from public.vehicles v
where vi.vehicle_id = v.id
  and vi.dealer_id is null;

-- 3. Make dealer_id NOT NULL (all rows should now have a value)
alter table public.vehicle_images
alter column dealer_id set not null;

-- 4. Add foreign key constraint to dealers table if it doesn't already exist
do $$
declare
  constraint_exists boolean;
begin
  -- Check if the foreign key constraint already exists
  select exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'vehicle_images'
      and constraint_name = 'vehicle_images_dealer_id_fkey'
      and constraint_type = 'FOREIGN KEY'
  ) into constraint_exists;
  
  -- Add the constraint only if it doesn't exist
  if not constraint_exists then
    alter table public.vehicle_images
    add constraint vehicle_images_dealer_id_fkey
    foreign key (dealer_id)
    references public.dealers(id) on delete cascade;
  end if;
end $$;

commit;
