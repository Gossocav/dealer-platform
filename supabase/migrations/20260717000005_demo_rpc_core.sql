begin;

alter table public.dealer_demo_subscriptions
  add column if not exists activation_attempt_id uuid,
  add column if not exists activation_reserved_at timestamptz,
  add column if not exists activation_last_error text;

create or replace function public.assert_demo_service_role()
returns void
language plpgsql
stable
set search_path = public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'DEMO_FORBIDDEN' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.assert_demo_actor_membership(
  p_dealer_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_dealer_id is null or p_actor_id is null then
    raise exception 'DEMO_INVALID_INPUT' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.dealer_users du
    where du.dealer_id = p_dealer_id
      and du.profile_id = p_actor_id
      and du.status = 'active'
  ) then
    raise exception 'DEMO_MEMBERSHIP_INVALID' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.demo_profile_snapshots(
  p_profile_code text
)
returns table(
  profile_code text,
  modules_snapshot jsonb,
  limits_snapshot jsonb,
  marketing_snapshot jsonb,
  email_policy jsonb
)
language sql
stable
set search_path = public
as $$
  with normalized as (
    select lower(coalesce(p_profile_code, '')) as code
  )
  select
    code,
    case code
      when 'base' then '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":false,"documents":true,"bulk_import":false,"marketplace_publish":true,"email_sending":false,"user_management":false,"roles_permissions":false,"billing":false,"advanced_settings":false,"api_integrations":false,"admin":false,"data_export":false,"registration":false,"social_marketing":false,"google_ads":false,"marketing_dashboard":false}'::jsonb
      when 'pro' then '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":true,"documents":true,"bulk_import":true,"marketplace_publish":true,"email_sending":false,"user_management":true,"roles_permissions":true,"billing":false,"advanced_settings":true,"api_integrations":true,"admin":false,"data_export":true,"registration":false,"social_marketing":false,"google_ads":false,"marketing_dashboard":false}'::jsonb
      when 'elite' then '{"dashboard":true,"vehicles":true,"leads":true,"clients":true,"calendar":true,"notifications":true,"dealership_profile":true,"reports":true,"analytics":true,"documents":true,"bulk_import":true,"marketplace_publish":true,"email_sending":true,"user_management":true,"roles_permissions":true,"billing":false,"advanced_settings":true,"api_integrations":true,"admin":false,"data_export":true,"registration":false,"social_marketing":true,"google_ads":true,"marketing_dashboard":true}'::jsonb
      else null
    end,
    case code
      when 'base' then '{"max_users":2,"max_vehicles":250,"max_leads":500,"max_clients":500,"max_appointments":500,"max_storage_mb":750,"can_send_email":false,"can_publish_marketplace":true,"can_export_data":false,"can_create_users":false,"can_use_bulk_import":false}'::jsonb
      when 'pro' then '{"max_users":5,"max_vehicles":2500,"max_leads":2500,"max_clients":2500,"max_appointments":2500,"max_storage_mb":2500,"can_send_email":false,"can_publish_marketplace":true,"can_export_data":true,"can_create_users":true,"can_use_bulk_import":true}'::jsonb
      when 'elite' then '{"max_users":10,"max_vehicles":9999,"max_leads":9999,"max_clients":9999,"max_appointments":9999,"max_storage_mb":5000,"can_send_email":true,"can_publish_marketplace":true,"can_export_data":true,"can_create_users":true,"can_use_bulk_import":true}'::jsonb
      else null
    end,
    case code
      when 'elite' then '{"social_visibility":true,"google_ads_management":true,"monthly_marketing_report":true,"meta_ads_management":false,"dedicated_landing_page":false,"local_seo":false}'::jsonb
      when 'base' then '{"social_visibility":false,"google_ads_management":false,"monthly_marketing_report":false,"meta_ads_management":false,"dedicated_landing_page":false,"local_seo":false}'::jsonb
      when 'pro' then '{"social_visibility":false,"google_ads_management":false,"monthly_marketing_report":false,"meta_ads_management":false,"dedicated_landing_page":false,"local_seo":false}'::jsonb
      else null
    end,
    case code
      when 'elite' then '{"email_sending":true,"can_send_email":true}'::jsonb
      when 'base' then '{"email_sending":false,"can_send_email":false}'::jsonb
      when 'pro' then '{"email_sending":false,"can_send_email":false}'::jsonb
      else null
    end
  from normalized
  where code in ('base', 'pro', 'elite')
$$;

create or replace function public.configure_demo_profile(
  p_dealer_id uuid,
  p_demo_request_id uuid,
  p_profile_code text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.dealer_demo_subscriptions%rowtype;
  v_before jsonb;
  v_profile text;
  v_modules jsonb;
  v_limits jsonb;
  v_marketing jsonb;
  v_email_policy jsonb;
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_dealer_id is null or p_demo_request_id is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
  end if;

  if not exists (select 1 from public.dealers d where d.id = p_dealer_id) then
    return jsonb_build_object('outcome', 'DEMO_DEALER_NOT_FOUND');
  end if;

  if not exists (select 1 from public.demo_requests dr where dr.id = p_demo_request_id) then
    return jsonb_build_object('outcome', 'DEMO_REQUEST_NOT_FOUND');
  end if;

  select profile_code, modules_snapshot, limits_snapshot, marketing_snapshot, email_policy
  into v_profile, v_modules, v_limits, v_marketing, v_email_policy
  from public.demo_profile_snapshots(p_profile_code);

  if v_profile is null then
    return jsonb_build_object('outcome', 'DEMO_PROFILE_INVALID');
  end if;

  select * into v_row
  from public.dealer_demo_subscriptions
  where dealer_id = p_dealer_id
  for update;

  if found and v_row.demo_status in ('active', 'suspended', 'expired', 'revoked', 'converted') then
    return jsonb_build_object('outcome', 'DEMO_PROFILE_IMMUTABLE');
  end if;

  if found
     and v_row.demo_request_id = p_demo_request_id
     and v_row.demo_profile_code = v_profile
     and v_row.modules_snapshot = v_modules
     and v_row.limits_snapshot = v_limits
     and v_row.marketing_snapshot = v_marketing
     and v_row.email_policy = v_email_policy
     and v_row.demo_status = 'configured'
     and v_row.activation_state = 'idle'
     and v_row.expires_at = v_row.starts_at + interval '7 days' then
    return jsonb_build_object('outcome', 'DEMO_CONFIG_NOOP', 'subscription', to_jsonb(v_row));
  end if;

  if not found then
    insert into public.dealer_demo_subscriptions (
      dealer_id,
      demo_request_id,
      demo_profile_code,
      modules_snapshot,
      limits_snapshot,
      marketing_snapshot,
      email_policy,
      starts_at,
      expires_at,
      request_status,
      activation_state,
      demo_status,
      lifecycle_version,
      activation_attempt_id,
      activation_reserved_at,
      activation_last_error,
      extension_used,
      extended_at,
      extended_by,
      extension_reason,
      created_at,
      updated_at
    )
    values (
      p_dealer_id,
      p_demo_request_id,
      v_profile,
      v_modules,
      v_limits,
      v_marketing,
      v_email_policy,
      v_now,
      v_now + interval '7 days',
      'approved_for_activation',
      'idle',
      'configured',
      1,
      null,
      null,
      null,
      false,
      null,
      null,
      null,
      v_now,
      v_now
    )
    returning * into v_row;
    v_before := null;
  else
    v_before := to_jsonb(v_row);
    update public.dealer_demo_subscriptions
    set
      demo_request_id = p_demo_request_id,
      demo_profile_code = v_profile,
      modules_snapshot = v_modules,
      limits_snapshot = v_limits,
      marketing_snapshot = v_marketing,
      email_policy = v_email_policy,
      starts_at = v_now,
      expires_at = v_now + interval '7 days',
      request_status = 'approved_for_activation',
      activation_state = 'idle',
      demo_status = 'configured',
      activation_attempt_id = null,
      activation_reserved_at = null,
      activation_last_error = null,
      extension_used = false,
      extended_at = null,
      extended_by = null,
      extension_reason = null,
      updated_at = v_now
    where id = v_row.id
    returning * into v_row;
  end if;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_type, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_by
  )
  values (
    v_row.dealer_id,
    p_actor_id,
    'user',
    'demo.configured',
    'dealer_demo_subscription',
    v_row.id,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('profile_code', v_profile),
    p_actor_id
  );

  return jsonb_build_object('outcome', 'DEMO_CONFIGURED', 'subscription', to_jsonb(v_row));
end;
$$;

create or replace function public.reserve_demo_activation(
  p_dealer_id uuid,
  p_actor_id uuid,
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.dealer_demo_subscriptions%rowtype;
  v_before jsonb;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_dealer_id is null or p_attempt_id is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
  end if;

  select * into v_row
  from public.dealer_demo_subscriptions
  where dealer_id = p_dealer_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'DEMO_NOT_FOUND');
  end if;

  if v_row.demo_status = 'active' and v_row.activation_state = 'completed' then
    return jsonb_build_object('outcome', 'DEMO_ALREADY_ACTIVE', 'subscription', to_jsonb(v_row));
  end if;

  if v_row.demo_status not in ('configured', 'ready_for_activation') then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_INVALID_STATE');
  end if;

  if v_row.activation_state not in ('idle', 'failed', 'reserved') then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_INVALID_STATE');
  end if;

  if v_row.activation_state = 'reserved' and v_row.activation_attempt_id = p_attempt_id then
    return jsonb_build_object('outcome', 'DEMO_RESERVATION_NOOP', 'subscription', to_jsonb(v_row));
  end if;

  if v_row.activation_state = 'reserved' and v_row.activation_attempt_id is distinct from p_attempt_id then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_ATTEMPT_CONFLICT');
  end if;

  v_before := to_jsonb(v_row);
  update public.dealer_demo_subscriptions
  set
    demo_status = 'ready_for_activation',
    activation_state = 'reserved',
    activation_attempt_id = p_attempt_id,
    activation_reserved_at = v_now,
    activation_last_error = null,
    updated_at = v_now
  where id = v_row.id
  returning * into v_row;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_type, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_by
  )
  values (
    p_dealer_id,
    p_actor_id,
    'user',
    'demo.activation_reserved',
    'dealer_demo_subscription',
    v_row.id,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('attempt_id', p_attempt_id),
    p_actor_id
  );

  return jsonb_build_object('outcome', 'DEMO_RESERVED', 'subscription', to_jsonb(v_row));
end;
$$;

create or replace function public.record_demo_activation_progress(
  p_dealer_id uuid,
  p_actor_id uuid,
  p_attempt_id uuid,
  p_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.dealer_demo_subscriptions%rowtype;
  v_before jsonb;
  v_state text := lower(coalesce(p_state, ''));
  v_expected text;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_dealer_id is null or p_attempt_id is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
  end if;

  if v_state not in ('auth_ready', 'dealer_ready', 'profile_ready', 'membership_ready') then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_INVALID_STATE');
  end if;

  select * into v_row
  from public.dealer_demo_subscriptions
  where dealer_id = p_dealer_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'DEMO_NOT_FOUND');
  end if;

  if v_row.activation_attempt_id is distinct from p_attempt_id then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_ATTEMPT_MISMATCH');
  end if;

  v_expected := case v_row.activation_state
    when 'reserved' then 'auth_ready'
    when 'auth_ready' then 'dealer_ready'
    when 'dealer_ready' then 'profile_ready'
    when 'profile_ready' then 'membership_ready'
    else null
  end;

  if v_expected is null then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_INVALID_STATE');
  end if;

  if v_state <> v_expected then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_SEQUENCE_INVALID');
  end if;

  v_before := to_jsonb(v_row);
  update public.dealer_demo_subscriptions
  set
    activation_state = v_state,
    updated_at = v_now
  where id = v_row.id
  returning * into v_row;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_type, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_by
  )
  values (
    p_dealer_id,
    p_actor_id,
    'user',
    'demo.activation_progressed',
    'dealer_demo_subscription',
    v_row.id,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('attempt_id', p_attempt_id, 'state', v_state),
    p_actor_id
  );

  return jsonb_build_object('outcome', 'DEMO_PROGRESS_RECORDED', 'subscription', to_jsonb(v_row));
end;
$$;

create or replace function public.finalize_demo_activation(
  p_dealer_id uuid,
  p_actor_id uuid,
  p_attempt_id uuid,
  p_profile_id uuid,
  p_demo_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.dealer_demo_subscriptions%rowtype;
  v_before jsonb;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_dealer_id is null or p_attempt_id is null or p_profile_id is null or p_demo_request_id is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
  end if;

  select * into v_row
  from public.dealer_demo_subscriptions
  where dealer_id = p_dealer_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'DEMO_NOT_FOUND');
  end if;

  if v_row.demo_status = 'active'
     and v_row.activation_state = 'completed'
     and v_row.activation_attempt_id = p_attempt_id then
    return jsonb_build_object('outcome', 'DEMO_FINALIZE_NOOP', 'subscription', to_jsonb(v_row));
  end if;

  if v_row.activation_attempt_id is distinct from p_attempt_id then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_ATTEMPT_MISMATCH');
  end if;

  if v_row.activation_state <> 'membership_ready' then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_INVALID_STATE');
  end if;

  if v_row.demo_request_id <> p_demo_request_id then
    return jsonb_build_object('outcome', 'DEMO_REQUEST_MISMATCH');
  end if;

  if not exists (select 1 from public.dealers d where d.id = p_dealer_id) then
    return jsonb_build_object('outcome', 'DEMO_DEALER_NOT_FOUND');
  end if;

  if not exists (select 1 from public.demo_requests dr where dr.id = p_demo_request_id) then
    return jsonb_build_object('outcome', 'DEMO_REQUEST_NOT_FOUND');
  end if;

  if not exists (
    select 1 from public.dealer_users du
    where du.dealer_id = p_dealer_id
      and du.profile_id = p_profile_id
      and du.status = 'active'
  ) then
    return jsonb_build_object('outcome', 'DEMO_MEMBERSHIP_INVALID');
  end if;

  v_before := to_jsonb(v_row);
  update public.dealer_demo_subscriptions
  set
    starts_at = v_now,
    expires_at = v_now + interval '7 days',
    activation_state = 'completed',
    demo_status = 'active',
    request_status = 'approved_for_activation',
    activation_last_error = null,
    lifecycle_version = greatest(v_row.lifecycle_version, 1),
    updated_at = v_now
  where id = v_row.id
  returning * into v_row;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_type, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_by
  )
  values (
    p_dealer_id,
    p_actor_id,
    'user',
    'demo.activated',
    'dealer_demo_subscription',
    v_row.id,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('attempt_id', p_attempt_id, 'request_id', p_demo_request_id, 'profile_id', p_profile_id),
    p_actor_id
  );

  return jsonb_build_object('outcome', 'DEMO_ACTIVATED', 'subscription', to_jsonb(v_row));
end;
$$;

create or replace function public.fail_demo_activation(
  p_dealer_id uuid,
  p_actor_id uuid,
  p_attempt_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.dealer_demo_subscriptions%rowtype;
  v_before jsonb;
  v_reason text := nullif(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), '');
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_dealer_id is null or p_attempt_id is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
  end if;

  if v_reason is null or char_length(v_reason) not between 3 and 500 then
    return jsonb_build_object('outcome', 'DEMO_INVALID_REASON');
  end if;

  select * into v_row
  from public.dealer_demo_subscriptions
  where dealer_id = p_dealer_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'DEMO_NOT_FOUND');
  end if;

  if v_row.activation_attempt_id is distinct from p_attempt_id then
    return jsonb_build_object('outcome', 'DEMO_ACTIVATION_ATTEMPT_MISMATCH');
  end if;

  v_before := to_jsonb(v_row);
  update public.dealer_demo_subscriptions
  set
    activation_state = 'failed',
    activation_last_error = v_reason,
    updated_at = v_now
  where id = v_row.id
  returning * into v_row;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_type, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_by
  )
  values (
    p_dealer_id,
    p_actor_id,
    'user',
    'demo.activation_failed',
    'dealer_demo_subscription',
    v_row.id,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('attempt_id', p_attempt_id, 'reason', v_reason),
    p_actor_id
  );

  return jsonb_build_object('outcome', 'DEMO_ACTIVATION_FAILED', 'subscription', to_jsonb(v_row));
end;
$$;

create or replace function public.transition_demo_lifecycle(
  p_dealer_id uuid,
  p_actor_id uuid,
  p_action text,
  p_reason text,
  p_lifecycle_version bigint,
  p_converted_plan_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.dealer_demo_subscriptions%rowtype;
  v_before jsonb;
  v_action text := lower(coalesce(p_action, ''));
  v_to text;
  v_reason text := nullif(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), '');
  v_now timestamptz := clock_timestamp();
  v_event text;
  v_converted_plan text := lower(nullif(btrim(coalesce(p_converted_plan_code, '')), ''));
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_dealer_id is null or p_lifecycle_version is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
  end if;

  select * into v_row
  from public.dealer_demo_subscriptions
  where dealer_id = p_dealer_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'DEMO_NOT_FOUND');
  end if;

  if v_row.lifecycle_version <> p_lifecycle_version then
    return jsonb_build_object('outcome', 'DEMO_LIFECYCLE_CONFLICT');
  end if;

  if v_row.demo_status in ('revoked', 'converted') then
    return jsonb_build_object('outcome', 'DEMO_TERMINAL_STATE');
  end if;

  v_to := case v_action
    when 'suspend_demo' then 'suspended'
    when 'revoke_demo' then 'revoked'
    when 'convert_demo' then 'converted'
    when 'reactivate_demo' then 'active'
    else null
  end;

  if v_to is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_ACTION');
  end if;

  if not (
    (v_row.demo_status = 'active' and v_to in ('suspended', 'revoked', 'converted')) or
    (v_row.demo_status = 'suspended' and v_to in ('active', 'revoked', 'converted')) or
    (v_row.demo_status = 'expired' and v_to in ('revoked', 'converted'))
  ) then
    return jsonb_build_object('outcome', 'DEMO_TRANSITION_NOT_ALLOWED');
  end if;

  if v_action in ('suspend_demo', 'revoke_demo') and (v_reason is null or char_length(v_reason) not between 3 and 500) then
    return jsonb_build_object('outcome', 'DEMO_INVALID_REASON');
  end if;

  if v_action = 'convert_demo' then
    if v_converted_plan is null then
      v_converted_plan := lower(coalesce(v_row.demo_profile_code, ''));
    end if;
    if v_converted_plan not in ('base', 'pro', 'elite') then
      return jsonb_build_object('outcome', 'DEMO_INVALID_PLAN');
    end if;
  end if;

  v_event := case v_action
    when 'suspend_demo' then 'demo.suspended'
    when 'revoke_demo' then 'demo.revoked'
    when 'convert_demo' then 'demo.converted'
    else 'demo.reactivated'
  end;

  v_before := to_jsonb(v_row);
  update public.dealer_demo_subscriptions
  set
    demo_status = v_to,
    converted_plan_code = case when v_to = 'converted' then v_converted_plan else converted_plan_code end,
    converted_at = case when v_to = 'converted' then v_now else converted_at end,
    converted_by = case when v_to = 'converted' then p_actor_id else converted_by end,
    subscription_status = case
      when v_to = 'converted' and subscription_status = 'demo' then 'pending_payment'
      else subscription_status
    end,
    lifecycle_version = lifecycle_version + 1,
    updated_at = v_now
  where id = v_row.id
  returning * into v_row;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_type, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_by
  )
  values (
    p_dealer_id,
    p_actor_id,
    'user',
    v_event,
    'dealer_demo_subscription',
    v_row.id,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('reason', v_reason, 'action', v_action, 'converted_plan_code', v_converted_plan),
    p_actor_id
  );

  return jsonb_build_object('outcome', 'DEMO_LIFECYCLE_UPDATED', 'subscription', to_jsonb(v_row));
end;
$$;

create or replace function public.extend_demo(
  p_dealer_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_lifecycle_version bigint,
  p_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.dealer_demo_subscriptions%rowtype;
  v_before jsonb;
  v_reason text := nullif(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), '');
  v_days integer := coalesce(p_days, 0);
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_dealer_id is null or p_lifecycle_version is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
  end if;

  if v_days < 1 or v_days > 7 then
    return jsonb_build_object('outcome', 'DEMO_INVALID_DURATION');
  end if;

  if v_reason is null or char_length(v_reason) not between 3 and 500 then
    return jsonb_build_object('outcome', 'DEMO_INVALID_REASON');
  end if;

  select * into v_row
  from public.dealer_demo_subscriptions
  where dealer_id = p_dealer_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'DEMO_NOT_FOUND');
  end if;

  if v_row.lifecycle_version <> p_lifecycle_version then
    return jsonb_build_object('outcome', 'DEMO_LIFECYCLE_CONFLICT');
  end if;

  if v_row.demo_status in ('revoked', 'converted') then
    return jsonb_build_object('outcome', 'DEMO_TERMINAL_STATE');
  end if;

  if v_row.demo_status <> 'expired' then
    return jsonb_build_object('outcome', 'DEMO_TRANSITION_NOT_ALLOWED');
  end if;

  if v_row.extension_used then
    return jsonb_build_object('outcome', 'DEMO_EXTENSION_ALREADY_USED');
  end if;

  v_before := to_jsonb(v_row);
  update public.dealer_demo_subscriptions
  set
    demo_status = 'active',
    extension_used = true,
    extended_at = v_now,
    extended_by = p_actor_id,
    extension_reason = v_reason,
    starts_at = v_now,
    expires_at = v_now + make_interval(days => v_days),
    lifecycle_version = lifecycle_version + 1,
    updated_at = v_now
  where id = v_row.id
  returning * into v_row;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_type, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_by
  )
  values (
    p_dealer_id,
    p_actor_id,
    'user',
    'demo.extended',
    'dealer_demo_subscription',
    v_row.id,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('reason', v_reason, 'days', v_days),
    p_actor_id
  );

  return jsonb_build_object('outcome', 'DEMO_EXTENDED', 'subscription', to_jsonb(v_row));
end;
$$;

create or replace function public.expire_due_demos()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.dealer_demo_subscriptions%rowtype;
  v_before jsonb;
  v_after public.dealer_demo_subscriptions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_processed integer := 0;
begin
  perform public.assert_demo_service_role();

  for v_row in
    select *
    from public.dealer_demo_subscriptions
    where demo_status = 'active'
      and expires_at <= v_now
    for update skip locked
  loop
    v_before := to_jsonb(v_row);

    update public.dealer_demo_subscriptions
    set
      demo_status = 'expired',
      lifecycle_version = lifecycle_version + 1,
      updated_at = v_now
    where id = v_row.id
    returning * into v_after;

    insert into public.audit_logs (
      dealer_id, actor_type, action, entity_type, entity_id,
      before_json, after_json, metadata_json
    )
    values (
      v_after.dealer_id,
      'system',
      'demo.expired',
      'dealer_demo_subscription',
      v_after.id,
      v_before,
      to_jsonb(v_after),
      jsonb_build_object('expired_at', v_now)
    );

    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object('outcome', 'DEMO_EXPIRE_COMPLETED', 'processed', v_processed);
end;
$$;

revoke all on function public.assert_demo_service_role() from public, anon, authenticated;
revoke all on function public.assert_demo_actor_membership(uuid, uuid) from public, anon, authenticated;
revoke all on function public.demo_profile_snapshots(text) from public, anon, authenticated;
revoke all on function public.configure_demo_profile(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.reserve_demo_activation(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_demo_activation_progress(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_demo_activation(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_demo_activation(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.transition_demo_lifecycle(uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.extend_demo(uuid, uuid, text, bigint, integer) from public, anon, authenticated;
revoke all on function public.expire_due_demos() from public, anon, authenticated;

grant execute on function public.configure_demo_profile(uuid, uuid, text, uuid) to service_role;
grant execute on function public.reserve_demo_activation(uuid, uuid, uuid) to service_role;
grant execute on function public.record_demo_activation_progress(uuid, uuid, uuid, text) to service_role;
grant execute on function public.finalize_demo_activation(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.fail_demo_activation(uuid, uuid, uuid, text) to service_role;
grant execute on function public.transition_demo_lifecycle(uuid, uuid, text, text, bigint, text) to service_role;
grant execute on function public.extend_demo(uuid, uuid, text, bigint, integer) to service_role;
grant execute on function public.expire_due_demos() to service_role;

commit;
