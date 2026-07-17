begin;

create or replace function public.enforce_demo_resource_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_dealer_id uuid;
  v_account_type text;
  v_demo_status text;
  v_expires_at timestamptz;
  v_request public.demo_requests%rowtype;
  v_module_key text := tg_argv[0];
  v_limit_key text := tg_argv[1];
  v_limit bigint;
  v_usage bigint;
  v_role text := coalesce(auth.role(), '');
begin
  v_dealer_id := nullif(v_row ->> 'dealer_id', '')::uuid;
  if v_dealer_id is null then
    raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001';
  end if;

  select account_type, demo_status, demo_expires_at
  into v_account_type, v_demo_status, v_expires_at
  from public.dealers where id = v_dealer_id;

  if coalesce(lower(v_account_type), '') <> 'demo' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select * into v_request from public.demo_requests
  where id = (select demo_request_id from public.dealers where id = v_dealer_id)
    and linked_dealer_id = v_dealer_id;

  if not found or v_request.activation_state <> 'completed'
     or v_request.demo_auth_user_id is null or v_request.demo_profile_id is null
     or jsonb_typeof(v_request.demo_modules) <> 'object'
     or jsonb_typeof(v_request.demo_limits) <> 'object' then
    raise exception 'DEMO_PROVISIONING_INCOMPLETE' using errcode = 'P0001';
  end if;

  if lower(coalesce(v_demo_status, '')) in ('suspended', 'revoked') then
    raise exception 'DEMO_SUSPENDED' using errcode = 'P0001';
  end if;
  if lower(coalesce(v_demo_status, '')) = 'expired' or v_expires_at is null or v_expires_at <= now() then
    raise exception 'DEMO_EXPIRED' using errcode = 'P0001';
  end if;
  if lower(coalesce(v_demo_status, '')) <> 'active' then
    raise exception 'DEMO_INACTIVE' using errcode = 'P0001';
  end if;

  if v_role = 'authenticated' and not exists (
    select 1 from public.dealer_users du
    where du.dealer_id = v_dealer_id and du.profile_id = auth.uid() and du.status = 'active'
  ) then
    raise exception 'DEMO_MEMBERSHIP_INVALID' using errcode = 'P0001';
  end if;
  if v_role = 'anon' and not (tg_table_name = 'leads' and coalesce(v_row ->> 'source', '') = 'marketplace') then
    raise exception 'DEMO_MEMBERSHIP_INVALID' using errcode = 'P0001';
  end if;

  if jsonb_typeof(v_request.demo_modules -> v_module_key) <> 'boolean'
     or (v_request.demo_modules ->> v_module_key)::boolean is not true then
    raise exception 'DEMO_MODULE_DISABLED' using errcode = 'P0001';
  end if;

  if tg_table_name = 'vehicles' and coalesce((v_row ->> 'published')::boolean, false) then
    if jsonb_typeof(v_request.demo_modules -> 'marketplace_publish') <> 'boolean'
       or (v_request.demo_modules ->> 'marketplace_publish')::boolean is not true
       or jsonb_typeof(v_request.demo_limits -> 'can_publish_marketplace') <> 'boolean'
       or (v_request.demo_limits ->> 'can_publish_marketplace')::boolean is not true then
      raise exception 'DEMO_MODULE_DISABLED' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' and v_limit_key <> '' then
    if jsonb_typeof(v_request.demo_limits -> v_limit_key) <> 'number' then
      raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001';
    end if;
    v_limit := (v_request.demo_limits ->> v_limit_key)::bigint;
    if v_limit < 0 then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;

    perform pg_advisory_xact_lock(hashtextextended(v_dealer_id::text || ':' || tg_table_name, 0));
    execute format('select count(*) from %I.%I where dealer_id = $1', tg_table_schema, tg_table_name)
      into v_usage using v_dealer_id;
    if v_usage + 1 > v_limit then
      raise exception 'DEMO_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.get_current_demo_access_context(p_dealer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_membership public.dealer_users%rowtype;
  v_dealer public.dealers%rowtype;
  v_request public.demo_requests%rowtype;
begin
  select * into v_membership from public.dealer_users
  where dealer_id = p_dealer_id and profile_id = auth.uid() and status = 'active';
  if not found then raise exception 'DEMO_MEMBERSHIP_INVALID' using errcode = 'P0001'; end if;
  select * into v_dealer from public.dealers where id = p_dealer_id;
  if not found then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;
  if coalesce(lower(v_dealer.account_type), '') = 'demo' then
    select * into v_request from public.demo_requests where id = v_dealer.demo_request_id and linked_dealer_id = p_dealer_id;
  end if;
  return jsonb_build_object(
    'account_type', v_dealer.account_type, 'demo_status', v_dealer.demo_status,
    'profile_code', v_request.demo_profile_code, 'profile_id', v_membership.profile_id,
    'user_id', auth.uid(), 'membership_role', v_membership.role, 'membership_active', true,
    'started_at', v_dealer.demo_started_at, 'expires_at', v_dealer.demo_expires_at,
    'modules', coalesce(v_request.demo_modules, '{}'::jsonb), 'limits', coalesce(v_request.demo_limits, '{}'::jsonb),
    'marketing_services', coalesce(v_request.demo_marketing_services, '{}'::jsonb),
    'provisioning_complete', coalesce(v_request.activation_state = 'completed' and v_request.demo_auth_user_id = auth.uid(), false)
  );
end;
$$;

revoke all on function public.get_current_demo_access_context(uuid) from public, anon;
grant execute on function public.get_current_demo_access_context(uuid) to authenticated;

create or replace function public.enforce_demo_membership_limit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_account_type text;
  v_demo_status text;
  v_request public.demo_requests%rowtype;
  v_limit bigint;
  v_usage bigint;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then return new; end if;
  select account_type, demo_status into v_account_type, v_demo_status from public.dealers where id = new.dealer_id;
  if coalesce(lower(v_account_type), '') <> 'demo' then return new; end if;

  select * into v_request from public.demo_requests
  where id = (select demo_request_id from public.dealers where id = new.dealer_id)
    and linked_dealer_id = new.dealer_id;
  if not found then raise exception 'DEMO_PROVISIONING_INCOMPLETE' using errcode = 'P0001'; end if;

  if lower(coalesce(v_demo_status, '')) = 'pending_activation'
     and v_request.activation_state in ('tenant_ready', 'membership_ready')
     and v_request.demo_auth_user_id = new.profile_id then
    return new;
  end if;

  if lower(coalesce(v_demo_status, '')) <> 'active' then raise exception 'DEMO_INACTIVE' using errcode = 'P0001'; end if;
  if v_request.demo_expires_at is null or v_request.demo_expires_at <= now() then raise exception 'DEMO_EXPIRED' using errcode = 'P0001'; end if;
  if jsonb_typeof(v_request.demo_modules -> 'user_management') <> 'boolean'
     or (v_request.demo_modules ->> 'user_management')::boolean is not true
     or jsonb_typeof(v_request.demo_limits -> 'max_users') <> 'number' then
    raise exception 'DEMO_MODULE_DISABLED' using errcode = 'P0001';
  end if;
  v_limit := (v_request.demo_limits ->> 'max_users')::bigint;
  if v_limit < 0 then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.dealer_id::text || ':dealer_users', 0));
  select count(*) into v_usage from public.dealer_users where dealer_id = new.dealer_id and status = 'active' and id is distinct from new.id;
  if v_usage + 1 > v_limit then raise exception 'DEMO_LIMIT_REACHED' using errcode = 'P0001'; end if;
  return new;
end;
$$;

create or replace function public.enforce_demo_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  v_vehicle_id uuid;
  v_dealer_id uuid;
  v_request public.demo_requests%rowtype;
  v_limit_bytes bigint;
  v_usage_bytes bigint;
  v_new_bytes bigint;
  v_old_bytes bigint := 0;
begin
  if new.bucket_id <> 'vehicle-images' then return new; end if;
  begin v_vehicle_id := split_part(new.name, '/', 2)::uuid;
  exception when others then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end;
  select dealer_id into v_dealer_id from public.vehicles where id = v_vehicle_id;
  if v_dealer_id is null then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;
  if coalesce((select lower(account_type) from public.dealers where id = v_dealer_id), '') <> 'demo' then return new; end if;

  select * into v_request from public.demo_requests
  where id = (select demo_request_id from public.dealers where id = v_dealer_id)
    and linked_dealer_id = v_dealer_id;
  if not found or v_request.activation_state <> 'completed' then raise exception 'DEMO_PROVISIONING_INCOMPLETE' using errcode = 'P0001'; end if;
  if coalesce(auth.role(), '') = 'authenticated' and not exists (
    select 1 from public.dealer_users du where du.dealer_id = v_dealer_id and du.profile_id = auth.uid() and du.status = 'active'
  ) then raise exception 'DEMO_MEMBERSHIP_INVALID' using errcode = 'P0001'; end if;
  if v_request.demo_expires_at is null or v_request.demo_expires_at <= now() then raise exception 'DEMO_EXPIRED' using errcode = 'P0001'; end if;
  if v_request.demo_status <> 'active' then raise exception 'DEMO_INACTIVE' using errcode = 'P0001'; end if;
  if jsonb_typeof(v_request.demo_modules -> 'vehicles') <> 'boolean' or (v_request.demo_modules ->> 'vehicles')::boolean is not true then raise exception 'DEMO_MODULE_DISABLED' using errcode = 'P0001'; end if;
  if jsonb_typeof(v_request.demo_limits -> 'max_storage_mb') <> 'number' then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;

  v_new_bytes := coalesce(nullif(new.metadata ->> 'size', '')::bigint, -1);
  if v_new_bytes < 0 then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' then v_old_bytes := coalesce(nullif(old.metadata ->> 'size', '')::bigint, 0); end if;
  v_limit_bytes := (v_request.demo_limits ->> 'max_storage_mb')::bigint * 1024 * 1024;
  if v_limit_bytes < 0 then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_dealer_id::text || ':storage', 0));
  select coalesce(sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)), 0)
  into v_usage_bytes
  from storage.objects o
  join public.vehicles v on v.id::text = split_part(o.name, '/', 2)
  where o.bucket_id = 'vehicle-images' and v.dealer_id = v_dealer_id;
  if v_usage_bytes - v_old_bytes + v_new_bytes > v_limit_bytes then raise exception 'DEMO_STORAGE_LIMIT_REACHED' using errcode = 'P0001'; end if;
  return new;
end;
$$;

do $$
declare v_spec text; v_parts text[];
begin
  foreach v_spec in array array[
    'vehicles,vehicles,max_vehicles', 'leads,leads,max_leads',
    'customers,clients,max_clients', 'appointments,calendar,max_appointments',
    'vehicle_images,vehicles,'
  ] loop
    v_parts := string_to_array(v_spec, ',');
    if to_regclass('public.' || v_parts[1]) is not null and not exists (
      select 1 from pg_trigger where tgname = 'trg_demo_enforce_' || v_parts[1] and tgrelid = to_regclass('public.' || v_parts[1]) and not tgisinternal
    ) then
      execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.enforce_demo_resource_write(%L, %L)',
        'trg_demo_enforce_' || v_parts[1], v_parts[1], v_parts[2], v_parts[3]);
    end if;
  end loop;

  if not exists (select 1 from pg_trigger where tgname = 'trg_demo_enforce_dealer_users' and tgrelid = 'public.dealer_users'::regclass and not tgisinternal) then
    create trigger trg_demo_enforce_dealer_users before insert or update on public.dealer_users
    for each row execute function public.enforce_demo_membership_limit();
  end if;
  if to_regclass('storage.objects') is not null and not exists (select 1 from pg_trigger where tgname = 'trg_demo_enforce_storage' and tgrelid = 'storage.objects'::regclass and not tgisinternal) then
    create trigger trg_demo_enforce_storage before insert or update on storage.objects
    for each row execute function public.enforce_demo_storage_quota();
  end if;
end
$$;

create index if not exists demo_requests_linked_dealer_active_idx on public.demo_requests (linked_dealer_id, demo_status, demo_expires_at);
create index if not exists customers_dealer_count_idx on public.customers (dealer_id);
create index if not exists appointments_dealer_count_idx on public.appointments (dealer_id);
create index if not exists dealer_users_active_count_idx on public.dealer_users (dealer_id) where status = 'active';

commit;
