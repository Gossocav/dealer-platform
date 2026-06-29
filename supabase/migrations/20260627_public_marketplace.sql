begin;

alter table public.dealers enable row level security;
alter table public.dealers force row level security;
alter table public.vehicles enable row level security;
alter table public.vehicles force row level security;
alter table public.vehicle_images enable row level security;
alter table public.vehicle_images force row level security;

drop policy if exists dealers_select_public on public.dealers;
create policy dealers_select_public
on public.dealers
for select
to anon
using (coalesce(status, 'active') = 'active');

grant select on public.dealers to anon;

drop policy if exists vehicles_select_public on public.vehicles;
create policy vehicles_select_public
on public.vehicles
for select
to anon
using (coalesce(lower(status), '') = 'published');

grant select on public.vehicles to anon;

drop policy if exists vehicle_images_select_public on public.vehicle_images;
create policy vehicle_images_select_public
on public.vehicle_images
for select
to anon
using (
  exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and coalesce(lower(v.status), '') = 'published'
  )
);

grant select on public.vehicle_images to anon;

commit;
