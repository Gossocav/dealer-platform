begin;

create or replace function public.raise_demo_runtime_status(
  p_status text,
  p_expires_at timestamptz
)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_status text := lower(coalesce(p_status, ''));
begin
  if v_status = 'suspended' then raise exception 'DEMO_SUSPENDED' using errcode = 'P0001'; end if;
  if v_status = 'revoked' then raise exception 'DEMO_REVOKED' using errcode = 'P0001'; end if;
  if v_status = 'converted' then raise exception 'DEMO_CONVERTED' using errcode = 'P0001'; end if;
  if v_status = 'expired' or p_expires_at is null or p_expires_at <= now() then
    raise exception 'DEMO_EXPIRED' using errcode = 'P0001';
  end if;
  if v_status <> 'active' then raise exception 'DEMO_INACTIVE' using errcode = 'P0001'; end if;
end;
$$;

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
  if v_dealer_id is null then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;

  select account_type, demo_status, demo_expires_at into v_account_type, v_demo_status, v_expires_at
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

  perform public.raise_demo_runtime_status(v_demo_status, v_expires_at);

  if v_role = 'authenticated' and not exists (
    select 1 from public.dealer_users du
    where du.dealer_id = v_dealer_id and du.profile_id = auth.uid() and du.status = 'active'
  ) then raise exception 'DEMO_MEMBERSHIP_INVALID' using errcode = 'P0001'; end if;
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

  if (tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.dealer_id is distinct from new.dealer_id))
     and v_limit_key <> '' then
    if jsonb_typeof(v_request.demo_limits -> v_limit_key) <> 'number' then
      raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001';
    end if;
    v_limit := (v_request.demo_limits ->> v_limit_key)::bigint;
    if v_limit < 0 then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_dealer_id::text || ':' || tg_table_name, 0));
    execute format('select count(*) from %I.%I where dealer_id = $1', tg_table_schema, tg_table_name)
      into v_usage using v_dealer_id;
    if v_usage + 1 > v_limit then raise exception 'DEMO_LIMIT_REACHED' using errcode = 'P0001'; end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.enforce_demo_membership_limit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_account_type text;
  v_demo_status text;
  v_expires_at timestamptz;
  v_request public.demo_requests%rowtype;
  v_limit bigint;
  v_usage bigint;
begin
  if new.status <> 'active'
     or (tg_op = 'UPDATE' and old.status = 'active' and old.dealer_id = new.dealer_id) then
    return new;
  end if;
  select account_type, demo_status, demo_expires_at into v_account_type, v_demo_status, v_expires_at
  from public.dealers where id = new.dealer_id;
  if coalesce(lower(v_account_type), '') <> 'demo' then return new; end if;
  select * into v_request from public.demo_requests
  where id = (select demo_request_id from public.dealers where id = new.dealer_id)
    and linked_dealer_id = new.dealer_id;
  if not found then raise exception 'DEMO_PROVISIONING_INCOMPLETE' using errcode = 'P0001'; end if;
  if lower(coalesce(v_demo_status, '')) = 'pending_activation'
     and v_request.activation_state in ('tenant_ready', 'membership_ready')
     and v_request.demo_auth_user_id = new.profile_id then return new; end if;

  perform public.raise_demo_runtime_status(v_demo_status, v_expires_at);
  if jsonb_typeof(v_request.demo_modules -> 'user_management') <> 'boolean'
     or (v_request.demo_modules ->> 'user_management')::boolean is not true
     or jsonb_typeof(v_request.demo_limits -> 'max_users') <> 'number' then
    raise exception 'DEMO_MODULE_DISABLED' using errcode = 'P0001';
  end if;
  v_limit := (v_request.demo_limits ->> 'max_users')::bigint;
  if v_limit < 0 then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.dealer_id::text || ':dealer_users', 0));
  select count(*) into v_usage from public.dealer_users
  where dealer_id = new.dealer_id and status = 'active' and id is distinct from new.id;
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
  v_old_dealer_id uuid;
begin
  if new.bucket_id <> 'vehicle-images' then return new; end if;
  select id, dealer_id into v_vehicle_id, v_dealer_id
  from public.vehicles
  where id::text in (split_part(new.name, '/', 1), split_part(new.name, '/', 2))
  limit 1;
  if v_dealer_id is null then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;
  if coalesce((select lower(account_type) from public.dealers where id = v_dealer_id), '') <> 'demo' then return new; end if;

  select * into v_request from public.demo_requests
  where id = (select demo_request_id from public.dealers where id = v_dealer_id)
    and linked_dealer_id = v_dealer_id;
  if not found or v_request.activation_state <> 'completed' then
    raise exception 'DEMO_PROVISIONING_INCOMPLETE' using errcode = 'P0001';
  end if;
  if coalesce(auth.role(), '') = 'authenticated' and not exists (
    select 1 from public.dealer_users du
    where du.dealer_id = v_dealer_id and du.profile_id = auth.uid() and du.status = 'active'
  ) then raise exception 'DEMO_MEMBERSHIP_INVALID' using errcode = 'P0001'; end if;

  perform public.raise_demo_runtime_status(v_request.demo_status, v_request.demo_expires_at);
  if jsonb_typeof(v_request.demo_modules -> 'vehicles') <> 'boolean'
     or (v_request.demo_modules ->> 'vehicles')::boolean is not true then
    raise exception 'DEMO_MODULE_DISABLED' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_request.demo_limits -> 'max_storage_mb') <> 'number' then
    raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001';
  end if;

  begin v_new_bytes := coalesce(nullif(new.metadata ->> 'size', '')::bigint, -1);
  exception when others then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end;
  if v_new_bytes < 0 then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' then
    select v.dealer_id into v_old_dealer_id
    from public.vehicles v
    where v.id::text in (split_part(old.name, '/', 1), split_part(old.name, '/', 2))
    limit 1;
    if v_old_dealer_id = v_dealer_id then
      begin v_old_bytes := coalesce(nullif(old.metadata ->> 'size', '')::bigint, 0);
      exception when others then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end;
    end if;
  end if;
  v_limit_bytes := (v_request.demo_limits ->> 'max_storage_mb')::bigint * 1024 * 1024;
  if v_limit_bytes < 0 then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_dealer_id::text || ':storage', 0));
  if exists (
    select 1 from storage.objects o
    join public.vehicles v on v.id::text in (split_part(o.name, '/', 1), split_part(o.name, '/', 2))
    where o.bucket_id = 'vehicle-images' and v.dealer_id = v_dealer_id
      and coalesce(o.metadata ->> 'size', '') !~ '^[0-9]+$'
  ) then raise exception 'DEMO_CONTEXT_INVALID' using errcode = 'P0001'; end if;
  select coalesce(sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)), 0)
  into v_usage_bytes
  from storage.objects o
  join public.vehicles v on v.id::text in (split_part(o.name, '/', 1), split_part(o.name, '/', 2))
  where o.bucket_id = 'vehicle-images' and v.dealer_id = v_dealer_id;
  if v_usage_bytes - v_old_bytes + v_new_bytes > v_limit_bytes then
    raise exception 'DEMO_STORAGE_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.raise_demo_runtime_status(text, timestamptz) from public, anon, authenticated;
grant execute on function public.raise_demo_runtime_status(text, timestamptz) to service_role;

commit;
