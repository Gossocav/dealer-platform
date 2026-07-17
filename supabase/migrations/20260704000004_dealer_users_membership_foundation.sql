begin;

create table if not exists public.dealer_users (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'dealer_member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_users_membership_unique unique (dealer_id, profile_id),
  constraint dealer_users_status_check check (status in ('active', 'invited', 'suspended', 'disabled'))
);

create index if not exists dealer_users_dealer_id_idx on public.dealer_users (dealer_id);
create index if not exists dealer_users_profile_id_idx on public.dealer_users (profile_id);
create index if not exists dealer_users_status_idx on public.dealer_users (status);

alter table public.dealer_users enable row level security;
alter table public.dealer_users force row level security;

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
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.dealer_id = dealer_users.dealer_id
  )
);

create policy dealer_users_insert_tenant
on public.dealer_users
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and actor.dealer_id = dealer_users.dealer_id
  )
  and exists (
    select 1
    from public.profiles target
    where target.id = dealer_users.profile_id
      and target.dealer_id = dealer_users.dealer_id
  )
);

create policy dealer_users_update_tenant
on public.dealer_users
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and actor.dealer_id = dealer_users.dealer_id
  )
)
with check (
  exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and actor.dealer_id = dealer_users.dealer_id
  )
  and exists (
    select 1
    from public.profiles target
    where target.id = dealer_users.profile_id
      and target.dealer_id = dealer_users.dealer_id
  )
);

create policy dealer_users_delete_tenant
on public.dealer_users
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and actor.dealer_id = dealer_users.dealer_id
  )
);

create or replace function public.enforce_dealer_user_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_dealer_id uuid;
begin
  select p.dealer_id
  into v_profile_dealer_id
  from public.profiles p
  where p.id = new.profile_id
  limit 1;

  if v_profile_dealer_id is null then
    raise exception 'profile_id non associato ad alcun dealer.' using errcode = '42501';
  end if;

  if new.dealer_id is null then
    new.dealer_id := v_profile_dealer_id;
  elsif new.dealer_id is distinct from v_profile_dealer_id then
    raise exception 'dealer_id non coerente con profile_id.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.dealer_id is distinct from old.dealer_id then
      raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
    end if;
    if new.profile_id is distinct from old.profile_id then
      raise exception 'profile_id non puo essere modificato.' using errcode = '42501';
    end if;
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

grant select, insert, update, delete on public.dealer_users to authenticated;

commit;
