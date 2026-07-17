begin;

-- Resolve actor dealer in a tenant-safe way, preferring active membership.
create or replace function public.current_dealer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select du.dealer_id
  from public.dealer_users du
  where du.profile_id = auth.uid()
    and du.status = 'active'
  order by du.created_at desc nulls last
  limit 1
$$;

revoke all on function public.current_dealer_id() from public;
grant execute on function public.current_dealer_id() to authenticated;

-- Keep core tenant tables under strict RLS.
alter table if exists public.dealer_users enable row level security;
alter table if exists public.dealer_users force row level security;
alter table if exists public.vehicles enable row level security;
alter table if exists public.vehicles force row level security;
alter table if exists public.leads enable row level security;
alter table if exists public.leads force row level security;

alter table if exists public.import_sources enable row level security;
alter table if exists public.import_sources force row level security;
alter table if exists public.import_profiles enable row level security;
alter table if exists public.import_profiles force row level security;
alter table if exists public.import_runs enable row level security;
alter table if exists public.import_runs force row level security;
alter table if exists public.import_items enable row level security;
alter table if exists public.import_items force row level security;
alter table if exists public.import_errors enable row level security;
alter table if exists public.import_errors force row level security;
alter table if exists public.import_dedup_keys enable row level security;
alter table if exists public.import_dedup_keys force row level security;
alter table if exists public.storage_objects enable row level security;
alter table if exists public.storage_objects force row level security;
alter table if exists public.audit_logs enable row level security;
alter table if exists public.audit_logs force row level security;

-- import_sources
drop policy if exists import_sources_select_own on public.import_sources;
drop policy if exists import_sources_insert_own on public.import_sources;
drop policy if exists import_sources_update_own on public.import_sources;
drop policy if exists import_sources_delete_own on public.import_sources;

create policy import_sources_select_own
on public.import_sources
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy import_sources_insert_own
on public.import_sources
for insert
to authenticated
with check (dealer_id = public.current_dealer_id());

create policy import_sources_update_own
on public.import_sources
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy import_sources_delete_own
on public.import_sources
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- import_profiles
drop policy if exists import_profiles_select_own on public.import_profiles;
drop policy if exists import_profiles_insert_own on public.import_profiles;
drop policy if exists import_profiles_update_own on public.import_profiles;
drop policy if exists import_profiles_delete_own on public.import_profiles;

create policy import_profiles_select_own
on public.import_profiles
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
);

create policy import_profiles_insert_own
on public.import_profiles
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
);

create policy import_profiles_update_own
on public.import_profiles
for update
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
)
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
);

create policy import_profiles_delete_own
on public.import_profiles
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- import_runs
drop policy if exists import_runs_select_own on public.import_runs;
drop policy if exists import_runs_insert_own on public.import_runs;
drop policy if exists import_runs_update_own on public.import_runs;
drop policy if exists import_runs_delete_own on public.import_runs;

create policy import_runs_select_own
on public.import_runs
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
  and (
    import_profile_id is null
    or exists (
      select 1
      from public.import_profiles p
      where p.id = import_profile_id
        and p.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_runs_insert_own
on public.import_runs
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
  and (
    import_profile_id is null
    or exists (
      select 1
      from public.import_profiles p
      where p.id = import_profile_id
        and p.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_runs_update_own
on public.import_runs
for update
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
)
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
  and (
    import_profile_id is null
    or exists (
      select 1
      from public.import_profiles p
      where p.id = import_profile_id
        and p.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_runs_delete_own
on public.import_runs
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- import_items
drop policy if exists import_items_select_own on public.import_items;
drop policy if exists import_items_insert_own on public.import_items;
drop policy if exists import_items_update_own on public.import_items;
drop policy if exists import_items_delete_own on public.import_items;

create policy import_items_select_own
on public.import_items
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_runs r
    where r.id = run_id
      and r.dealer_id = public.current_dealer_id()
  )
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
  and (
    vehicle_id is null
    or exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_items_insert_own
on public.import_items
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_runs r
    where r.id = run_id
      and r.dealer_id = public.current_dealer_id()
  )
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
  and (
    vehicle_id is null
    or exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_items_update_own
on public.import_items
for update
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_runs r
    where r.id = run_id
      and r.dealer_id = public.current_dealer_id()
  )
)
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_runs r
    where r.id = run_id
      and r.dealer_id = public.current_dealer_id()
  )
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
  and (
    vehicle_id is null
    or exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_items_delete_own
on public.import_items
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- import_errors
drop policy if exists import_errors_select_own on public.import_errors;
drop policy if exists import_errors_insert_own on public.import_errors;
drop policy if exists import_errors_update_own on public.import_errors;
drop policy if exists import_errors_delete_own on public.import_errors;

create policy import_errors_select_own
on public.import_errors
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_runs r
    where r.id = run_id
      and r.dealer_id = public.current_dealer_id()
  )
  and (
    item_id is null
    or exists (
      select 1
      from public.import_items i
      where i.id = item_id
        and i.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_errors_insert_own
on public.import_errors
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_runs r
    where r.id = run_id
      and r.dealer_id = public.current_dealer_id()
  )
  and (
    item_id is null
    or exists (
      select 1
      from public.import_items i
      where i.id = item_id
        and i.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_errors_update_own
on public.import_errors
for update
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_runs r
    where r.id = run_id
      and r.dealer_id = public.current_dealer_id()
  )
)
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_runs r
    where r.id = run_id
      and r.dealer_id = public.current_dealer_id()
  )
  and (
    item_id is null
    or exists (
      select 1
      from public.import_items i
      where i.id = item_id
        and i.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_errors_delete_own
on public.import_errors
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- import_dedup_keys
drop policy if exists import_dedup_keys_select_own on public.import_dedup_keys;
drop policy if exists import_dedup_keys_insert_own on public.import_dedup_keys;
drop policy if exists import_dedup_keys_update_own on public.import_dedup_keys;
drop policy if exists import_dedup_keys_delete_own on public.import_dedup_keys;

create policy import_dedup_keys_select_own
on public.import_dedup_keys
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
  and (
    vehicle_id is null
    or exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_dedup_keys_insert_own
on public.import_dedup_keys
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
  and (
    vehicle_id is null
    or exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_dedup_keys_update_own
on public.import_dedup_keys
for update
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
)
with check (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1
    from public.import_sources s
    where s.id = source_id
      and s.dealer_id = public.current_dealer_id()
  )
  and (
    vehicle_id is null
    or exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.dealer_id = public.current_dealer_id()
    )
  )
);

create policy import_dedup_keys_delete_own
on public.import_dedup_keys
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- storage_objects
drop policy if exists storage_objects_select_own on public.storage_objects;
drop policy if exists storage_objects_insert_own on public.storage_objects;
drop policy if exists storage_objects_update_own on public.storage_objects;
drop policy if exists storage_objects_delete_own on public.storage_objects;

create policy storage_objects_select_own
on public.storage_objects
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy storage_objects_insert_own
on public.storage_objects
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and (owner_profile_id is null or owner_profile_id = auth.uid())
);

create policy storage_objects_update_own
on public.storage_objects
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (
  dealer_id = public.current_dealer_id()
  and (owner_profile_id is null or owner_profile_id = auth.uid())
);

create policy storage_objects_delete_own
on public.storage_objects
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

-- audit_logs (append-friendly: no update/delete policy)
drop policy if exists audit_logs_select_own on public.audit_logs;
drop policy if exists audit_logs_insert_own on public.audit_logs;

create policy audit_logs_select_own
on public.audit_logs
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy audit_logs_insert_own
on public.audit_logs
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
  and (actor_profile_id is null or actor_profile_id = auth.uid())
  and (created_by is null or created_by = auth.uid())
);

commit;
