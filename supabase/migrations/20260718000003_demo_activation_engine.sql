begin;

alter table public.demo_requests
  add column if not exists linked_dealer_id uuid references public.dealers(id) on delete set null,
  add column if not exists demo_auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists demo_started_at timestamptz,
  add column if not exists demo_expires_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid references auth.users(id) on delete set null,
  add column if not exists activation_attempt_id uuid,
  add column if not exists activation_state text not null default 'idle',
  add column if not exists activation_reserved_at timestamptz,
  add column if not exists activation_last_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'demo_requests_activation_state_check'
      and conrelid = 'public.demo_requests'::regclass
  ) then
    alter table public.demo_requests
      add constraint demo_requests_activation_state_check
      check (activation_state in ('idle', 'reserved', 'auth_ready', 'tenant_ready', 'membership_ready', 'failed', 'completed'))
      not valid;
  end if;
end
$$;

create index if not exists demo_requests_activation_state_idx
  on public.demo_requests (activation_state, activation_reserved_at);

create index if not exists demo_requests_demo_auth_user_idx
  on public.demo_requests (demo_auth_user_id)
  where demo_auth_user_id is not null;

create unique index if not exists dealers_demo_request_id_uidx
  on public.dealers (demo_request_id)
  where demo_request_id is not null;

create or replace function public.reserve_demo_activation(
  p_request_id uuid,
  p_actor_id uuid,
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.demo_requests%rowtype;
  v_profile_enabled boolean;
begin
  select * into v_request
  from public.demo_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_request.demo_status = 'active' then
    if v_request.linked_dealer_id is null
       or v_request.demo_auth_user_id is null
       or not exists (
         select 1 from public.dealer_users du
         where du.dealer_id = v_request.linked_dealer_id
           and du.profile_id = v_request.demo_auth_user_id
           and du.status = 'active'
       ) then
      return jsonb_build_object('outcome', 'invalid_state');
    end if;
    return jsonb_build_object('outcome', 'already_active', 'request', to_jsonb(v_request));
  end if;

  if v_request.demo_status not in ('configured', 'ready_for_activation') then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;

  select enabled into v_profile_enabled
  from public.demo_profiles
  where id = v_request.demo_profile_id
    and code = v_request.demo_profile_code;

  if coalesce(v_profile_enabled, false) is false then
    return jsonb_build_object('outcome', 'invalid_profile');
  end if;

  if v_request.activation_state in ('reserved', 'auth_ready', 'tenant_ready', 'membership_ready')
     and v_request.activation_attempt_id is distinct from p_attempt_id
     and v_request.activation_reserved_at > now() - interval '10 minutes' then
    return jsonb_build_object('outcome', 'busy');
  end if;

  update public.demo_requests
  set activation_attempt_id = p_attempt_id,
      activation_state = 'reserved',
      activation_reserved_at = now(),
      activation_last_error = null,
      activated_by = p_actor_id,
      updated_at = now()
  where id = p_request_id
  returning * into v_request;

  return jsonb_build_object('outcome', 'reserved', 'request', to_jsonb(v_request));
end;
$$;

create or replace function public.record_demo_activation_progress(
  p_request_id uuid,
  p_attempt_id uuid,
  p_state text,
  p_user_id uuid default null,
  p_dealer_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_state not in ('auth_ready', 'tenant_ready', 'membership_ready') then
    raise exception 'Invalid activation progress state.' using errcode = '22023';
  end if;

  update public.demo_requests
  set activation_state = p_state,
      demo_auth_user_id = coalesce(p_user_id, demo_auth_user_id),
      linked_dealer_id = coalesce(p_dealer_id, linked_dealer_id),
      updated_at = now()
  where id = p_request_id
    and activation_attempt_id = p_attempt_id
    and demo_status in ('configured', 'ready_for_activation');

  return found;
end;
$$;

create or replace function public.fail_demo_activation(
  p_request_id uuid,
  p_attempt_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.demo_requests
  set activation_state = 'failed',
      activation_last_error = left(coalesce(nullif(btrim(p_error_code), ''), 'activation_failed'), 100),
      updated_at = now()
  where id = p_request_id
    and activation_attempt_id = p_attempt_id
    and demo_status in ('configured', 'ready_for_activation');

  return found;
end;
$$;

create or replace function public.finalize_demo_activation(
  p_request_id uuid,
  p_actor_id uuid,
  p_attempt_id uuid,
  p_user_id uuid,
  p_dealer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.demo_requests%rowtype;
  v_started_at timestamptz := clock_timestamp();
  v_expires_at timestamptz;
begin
  select * into v_request
  from public.demo_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Activation request not found.' using errcode = 'P0002';
  end if;

  if v_request.demo_status = 'active' then
    return to_jsonb(v_request);
  end if;

  if v_request.activation_attempt_id is distinct from p_attempt_id
     or v_request.activation_state <> 'membership_ready'
     or v_request.demo_status not in ('configured', 'ready_for_activation')
     or v_request.demo_auth_user_id is distinct from p_user_id
     or v_request.linked_dealer_id is distinct from p_dealer_id then
    raise exception 'Activation state mismatch.' using errcode = '40001';
  end if;

  if v_request.demo_duration_days is null or v_request.demo_duration_days not between 1 and 30 then
    raise exception 'Invalid demo duration.' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.dealers d
    where d.id = p_dealer_id and d.demo_request_id = p_request_id
  ) or not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.dealer_id = p_dealer_id
  ) or not exists (
    select 1 from public.dealer_users du
    where du.dealer_id = p_dealer_id and du.profile_id = p_user_id and du.status = 'active'
  ) then
    raise exception 'Activation prerequisites incomplete.' using errcode = '23503';
  end if;

  v_expires_at := v_started_at + make_interval(days => v_request.demo_duration_days);

  update public.dealers
  set account_type = 'demo',
      demo_status = 'active',
      demo_started_at = v_started_at,
      demo_expires_at = v_expires_at,
      demo_request_id = p_request_id,
      demo_approved_by = p_actor_id,
      demo_approved_at = v_started_at,
      updated_at = v_started_at
  where id = p_dealer_id;

  update public.demo_requests
  set status = 'activated',
      demo_status = 'active',
      demo_started_at = v_started_at,
      demo_expires_at = v_expires_at,
      activated_at = v_started_at,
      activated_by = p_actor_id,
      activation_state = 'completed',
      activation_last_error = null,
      updated_at = v_started_at
  where id = p_request_id
  returning * into v_request;

  return to_jsonb(v_request);
end;
$$;

create or replace function public.protect_activated_demo_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.demo_status = 'active' and (
    new.demo_profile_id is distinct from old.demo_profile_id or
    new.demo_profile_code is distinct from old.demo_profile_code or
    new.demo_profile_price_monthly is distinct from old.demo_profile_price_monthly or
    new.demo_duration_days is distinct from old.demo_duration_days or
    new.demo_modules is distinct from old.demo_modules or
    new.demo_limits is distinct from old.demo_limits or
    new.demo_marketing_services is distinct from old.demo_marketing_services
  ) then
    raise exception 'Activated demo snapshot is immutable.' using errcode = '55000';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_protect_activated_demo_snapshot'
      and tgrelid = 'public.demo_requests'::regclass
      and not tgisinternal
  ) then
    create trigger trg_protect_activated_demo_snapshot
    before update on public.demo_requests
    for each row execute function public.protect_activated_demo_snapshot();
  end if;
end
$$;

revoke all on function public.reserve_demo_activation(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_demo_activation_progress(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_demo_activation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_demo_activation(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_demo_activation(uuid, uuid, uuid) to service_role;
grant execute on function public.record_demo_activation_progress(uuid, uuid, text, uuid, uuid) to service_role;
grant execute on function public.fail_demo_activation(uuid, uuid, text) to service_role;
grant execute on function public.finalize_demo_activation(uuid, uuid, uuid, uuid, uuid) to service_role;

commit;
