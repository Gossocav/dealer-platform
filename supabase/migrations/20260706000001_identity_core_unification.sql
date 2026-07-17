begin;

-- Identity core: single source of truth for tenant resolution is dealer_users active membership.
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

-- Remove duplicated tenant resolver.
drop function if exists public.current_actor_dealer_id();

-- Keep compatibility during migration: ensure membership exists for legacy profiles with dealer_id.
insert into public.dealer_users (dealer_id, profile_id, role, status, created_at, updated_at)
select
  p.dealer_id,
  p.id,
  coalesce(nullif(trim(p.role), ''), 'dealer_member') as role,
  coalesce(nullif(trim(p.status), ''), 'active') as status,
  coalesce(p.created_at, now()) as created_at,
  now() as updated_at
from public.profiles p
where p.dealer_id is not null
on conflict (dealer_id, profile_id)
do update set
  role = excluded.role,
  status = excluded.status,
  updated_at = now();

-- dealer_users policies must be membership-based and not rely on profiles.dealer_id as primary source.
drop policy if exists dealer_users_select_own_or_tenant on public.dealer_users;
drop policy if exists dealer_users_insert_tenant on public.dealer_users;
drop policy if exists dealer_users_update_tenant on public.dealer_users;
drop policy if exists dealer_users_delete_tenant on public.dealer_users;

create policy dealer_users_select_own_or_tenant
on public.dealer_users
for select
to authenticated
using (
  profile_id = auth.uid()
  or dealer_id = public.current_dealer_id()
);

create policy dealer_users_insert_tenant
on public.dealer_users
for insert
to authenticated
with check (
  dealer_id = public.current_dealer_id()
);

create policy dealer_users_update_tenant
on public.dealer_users
for update
to authenticated
using (
  dealer_id = public.current_dealer_id()
)
with check (
  dealer_id = public.current_dealer_id()
);

create policy dealer_users_delete_tenant
on public.dealer_users
for delete
to authenticated
using (
  dealer_id = public.current_dealer_id()
);

create or replace function public.enforce_dealer_user_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_dealer_id uuid;
begin
  v_actor_dealer_id := public.current_dealer_id();

  if tg_op = 'INSERT' then
    if new.dealer_id is null then
      new.dealer_id := v_actor_dealer_id;
    end if;

    if new.dealer_id is null then
      raise exception 'dealer_id obbligatorio per membership.' using errcode = '23502';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.dealer_id is distinct from old.dealer_id then
      raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
    end if;
    if new.profile_id is distinct from old.profile_id then
      raise exception 'profile_id non puo essere modificato.' using errcode = '42501';
    end if;
  end if;

  if new.profile_id is null then
    raise exception 'profile_id obbligatorio per membership.' using errcode = '23502';
  end if;

  new.role := coalesce(nullif(trim(new.role), ''), 'dealer_member');
  new.status := coalesce(nullif(trim(new.status), ''), 'active');
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists trg_enforce_dealer_user_membership on public.dealer_users;
create trigger trg_enforce_dealer_user_membership
before insert or update on public.dealer_users
for each row
execute function public.enforce_dealer_user_membership();

commit;
