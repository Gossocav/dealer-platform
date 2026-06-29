begin;

alter table public.dealers
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists zip_code text,
  add column if not exists description text,
  add column if not exists opening_hours text,
  add column if not exists social_links text;

alter table public.dealers enable row level security;
alter table public.dealers force row level security;

drop policy if exists dealers_select_public on public.dealers;
create policy dealers_select_public
on public.dealers
for select
to anon
using (coalesce(status, 'active') = 'active');

drop policy if exists dealers_select_own on public.dealers;
create policy dealers_select_own
on public.dealers
for select
to authenticated
using (id = public.current_dealer_id());

drop policy if exists dealers_update_own on public.dealers;
create policy dealers_update_own
on public.dealers
for update
to authenticated
using (id = public.current_dealer_id())
with check (id = public.current_dealer_id());

grant select on public.dealers to anon;
grant select, update on public.dealers to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vehicles_dealer_required'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_dealer_required
      check (dealer_id is not null) not valid;
  end if;
end;
$$;

commit;