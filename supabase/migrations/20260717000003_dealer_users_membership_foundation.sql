begin;

create table if not exists public.dealer_users (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  profile_id uuid not null,
  role text not null default 'dealer_member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dealer_users
  alter column dealer_id set not null,
  alter column profile_id set not null,
  alter column role set default 'dealer_member',
  alter column role set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dealer_users_dealer_fkey'
      and conrelid = 'public.dealer_users'::regclass
  ) then
    alter table public.dealer_users
      add constraint dealer_users_dealer_fkey
      foreign key (dealer_id) references public.dealers(id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dealer_users_profile_fkey'
      and conrelid = 'public.dealer_users'::regclass
  ) then
    alter table public.dealer_users
      add constraint dealer_users_profile_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dealer_users_membership_unique'
      and conrelid = 'public.dealer_users'::regclass
  ) then
    alter table public.dealer_users
      add constraint dealer_users_membership_unique unique (dealer_id, profile_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dealer_users_status_check'
      and conrelid = 'public.dealer_users'::regclass
  ) then
    alter table public.dealer_users
      add constraint dealer_users_status_check
      check (status in ('invited', 'active', 'suspended', 'disabled'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dealer_users_role_check'
      and conrelid = 'public.dealer_users'::regclass
  ) then
    alter table public.dealer_users
      add constraint dealer_users_role_check
      check (role = 'dealer_member');
  end if;
end;
$$;

create index if not exists dealer_users_dealer_id_idx on public.dealer_users (dealer_id);
create index if not exists dealer_users_profile_id_idx on public.dealer_users (profile_id);
create index if not exists dealer_users_status_idx on public.dealer_users (status);

create or replace function public.current_dealer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with active_memberships as (
    select distinct du.dealer_id
    from public.dealer_users du
    where du.profile_id = auth.uid()
      and du.status = 'active'
      and du.dealer_id is not null
  )
  select case
    when (select count(*) from active_memberships) = 1 then (select dealer_id from active_memberships limit 1)
    else null::uuid
  end
$$;

revoke all on function public.current_dealer_id() from public;
grant execute on function public.current_dealer_id() to authenticated;

alter table public.dealer_users enable row level security;
alter table public.dealer_users force row level security;

drop policy if exists dealer_users_select_own_or_tenant on public.dealer_users;
drop policy if exists dealer_users_insert_tenant on public.dealer_users;
drop policy if exists dealer_users_update_tenant on public.dealer_users;
drop policy if exists dealer_users_delete_tenant on public.dealer_users;

create policy dealer_users_select_own
on public.dealer_users
for select
to authenticated
using (
  profile_id = auth.uid()
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
  if new.profile_id is null then
    raise exception 'profile_id obbligatorio per membership.' using errcode = '23502';
  end if;

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

  new.role := coalesce(nullif(lower(trim(new.role)), ''), 'dealer_member');
  if new.role <> 'dealer_member' then
    raise exception 'role non supportato: solo dealer_member.' using errcode = '23514';
  end if;

  new.status := coalesce(nullif(lower(trim(new.status)), ''), 'active');
  if new.status not in ('invited', 'active', 'suspended', 'disabled') then
    raise exception 'status non supportato per membership.' using errcode = '23514';
  end if;

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
  'dealer_member' as role,
  case
    when lower(trim(coalesce(p.status, ''))) in ('invited', 'active', 'suspended', 'disabled') then lower(trim(coalesce(p.status, '')))
    else 'active'
  end as status,
  coalesce(p.created_at, now()) as created_at,
  now() as updated_at
from public.profiles p
where p.dealer_id is not null
on conflict (dealer_id, profile_id)
do update set
  role = excluded.role,
  status = excluded.status,
  updated_at = now();

revoke all on public.dealer_users from public;
revoke all on public.dealer_users from anon;
revoke insert, update, delete on public.dealer_users from authenticated;
grant select on public.dealer_users to authenticated;

commit;
