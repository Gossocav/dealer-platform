begin;

alter table public.demo_requests
  add column if not exists expired_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id) on delete set null,
  add column if not exists suspension_reason text,
  add column if not exists reactivated_at timestamptz,
  add column if not exists reactivated_by uuid references auth.users(id) on delete set null,
  add column if not exists current_period_started_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id) on delete set null,
  add column if not exists revocation_reason text,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid references auth.users(id) on delete set null,
  add column if not exists lifecycle_version bigint not null default 0;

create index if not exists demo_requests_due_expiration_idx
  on public.demo_requests (demo_expires_at, id) where demo_status = 'active';
create index if not exists demo_requests_lifecycle_dealer_idx
  on public.demo_requests (linked_dealer_id, demo_status);

update public.demo_requests
set current_period_started_at = demo_started_at
where current_period_started_at is null and demo_started_at is not null;

-- PostgreSQL cannot alter a CHECK expression in place. Replace only the named,
-- non-data constraint created by the Demo profile migration.
do $$
declare v_definition text;
begin
  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conname = 'demo_requests_demo_status_check'
    and conrelid = 'public.demo_requests'::regclass;
  if v_definition is not null and v_definition not like '%revoked%' then
    alter table public.demo_requests drop constraint demo_requests_demo_status_check;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'demo_requests_demo_status_check'
      and conrelid = 'public.demo_requests'::regclass
  ) then
    alter table public.demo_requests add constraint demo_requests_demo_status_check
      check (demo_status in ('not_configured','configured','ready_for_activation','active','expired','suspended','revoked','converted')) not valid;
  end if;
end $$;

create or replace function public.protect_activated_demo_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.demo_status in ('active','expired','suspended','revoked','converted') and (
    new.demo_profile_id is distinct from old.demo_profile_id or
    new.demo_profile_code is distinct from old.demo_profile_code or
    new.demo_profile_price_monthly is distinct from old.demo_profile_price_monthly or
    new.demo_duration_days is distinct from old.demo_duration_days or
    new.demo_modules is distinct from old.demo_modules or
    new.demo_limits is distinct from old.demo_limits or
    new.demo_marketing_services is distinct from old.demo_marketing_services
  ) then raise exception 'Activated demo snapshot is immutable.' using errcode = '55000'; end if;
  return new;
end $$;

create or replace function public.transition_demo_lifecycle(
  p_request_id uuid, p_actor_id uuid, p_action text,
  p_reason text default null, p_duration_days integer default null,
  p_expected_version bigint default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_request public.demo_requests%rowtype;
  v_dealer public.dealers%rowtype;
  v_from text;
  v_to text;
  v_now timestamptz := clock_timestamp();
  v_expires timestamptz;
  v_reason text := nullif(regexp_replace(btrim(coalesce(p_reason,'')), '\s+', ' ', 'g'), '');
begin
  select * into v_request from public.demo_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  if p_expected_version is not null and v_request.lifecycle_version <> p_expected_version then
    return jsonb_build_object('outcome','conflict');
  end if;
  v_from := v_request.demo_status;
  v_to := case p_action when 'suspend_demo' then 'suspended' when 'reactivate_demo' then 'active'
    when 'revoke_demo' then 'revoked' when 'convert_demo' then 'converted' else null end;
  if v_to is null then return jsonb_build_object('outcome','invalid_action'); end if;
  if v_from = v_to then return jsonb_build_object('outcome','already_applied','request',to_jsonb(v_request)); end if;
  if not ((v_from = 'active' and v_to in ('suspended','revoked','converted'))
    or (v_from in ('suspended','expired') and v_to in ('active','revoked','converted'))) then
    return jsonb_build_object('outcome','transition_not_allowed');
  end if;
  if p_action in ('suspend_demo','revoke_demo') and (v_reason is null or length(v_reason) not between 3 and 500) then
    return jsonb_build_object('outcome','invalid_input');
  end if;
  if p_action = 'reactivate_demo' and (p_duration_days is null or p_duration_days not between 1 and 30) then
    return jsonb_build_object('outcome','invalid_input');
  end if;
  if v_request.linked_dealer_id is null or v_request.demo_auth_user_id is null
     or v_request.demo_profile_id is null or v_request.activation_state <> 'completed'
     or jsonb_typeof(v_request.demo_modules) <> 'object' or jsonb_typeof(v_request.demo_limits) <> 'object'
     or jsonb_typeof(v_request.demo_marketing_services) <> 'object' then
    return jsonb_build_object('outcome','provisioning_incomplete');
  end if;
  select * into v_dealer from public.dealers where id = v_request.linked_dealer_id and demo_request_id = p_request_id for update;
  if not found or not exists (select 1 from public.profiles p where p.id=v_request.demo_auth_user_id and p.dealer_id=v_request.linked_dealer_id)
     or not exists (select 1 from public.dealer_users du where du.dealer_id=v_request.linked_dealer_id and du.profile_id=v_request.demo_auth_user_id and du.status='active') then
    return jsonb_build_object('outcome','provisioning_incomplete');
  end if;
  if p_action = 'reactivate_demo' then v_expires := v_now + make_interval(days => p_duration_days); end if;

  update public.demo_requests set demo_status=v_to, lifecycle_version=lifecycle_version+1, updated_at=v_now,
    expired_at=case when v_to='expired' then v_now else expired_at end,
    suspended_at=case when v_to='suspended' then v_now else suspended_at end,
    suspended_by=case when v_to='suspended' then p_actor_id else suspended_by end,
    suspension_reason=case when v_to='suspended' then v_reason else suspension_reason end,
    reactivated_at=case when p_action='reactivate_demo' then v_now else reactivated_at end,
    reactivated_by=case when p_action='reactivate_demo' then p_actor_id else reactivated_by end,
    current_period_started_at=case when p_action='reactivate_demo' then v_now else coalesce(current_period_started_at,demo_started_at) end,
    demo_expires_at=case when p_action='reactivate_demo' then v_expires else demo_expires_at end,
    revoked_at=case when v_to='revoked' then v_now else revoked_at end,
    revoked_by=case when v_to='revoked' then p_actor_id else revoked_by end,
    revocation_reason=case when v_to='revoked' then v_reason else revocation_reason end,
    converted_at=case when v_to='converted' then v_now else converted_at end,
    converted_by=case when v_to='converted' then p_actor_id else converted_by end
  where id=p_request_id returning * into v_request;

  update public.dealers set account_type=case when v_to='converted' then 'paid' else account_type end,
    demo_status=v_to, demo_expires_at=case when p_action='reactivate_demo' then v_expires else demo_expires_at end,
    demo_revoked_at=case when v_to='revoked' then v_now else demo_revoked_at end,
    demo_converted_at=case when v_to='converted' then v_now else demo_converted_at end, updated_at=v_now
  where id=v_request.linked_dealer_id;

  insert into public.audit_logs(dealer_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_json,after_json,metadata_json,created_by)
  values(v_request.linked_dealer_id,p_actor_id,'user',case p_action
      when 'suspend_demo' then 'demo.suspended' when 'reactivate_demo' then 'demo.reactivated'
      when 'revoke_demo' then 'demo.revoked' when 'convert_demo' then 'demo.converted' end,
    'demo_request',p_request_id,
    jsonb_build_object('demo_status',v_from),jsonb_build_object('demo_status',v_to),
    jsonb_build_object('lifecycle_version',v_request.lifecycle_version,'reason',v_reason,'duration_days',p_duration_days),p_actor_id);
  return jsonb_build_object('outcome','updated','request',to_jsonb(v_request));
end $$;

create or replace function public.expire_due_demos()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_request public.demo_requests%rowtype; v_count integer := 0; v_now timestamptz := clock_timestamp();
begin
  for v_request in select * from public.demo_requests where demo_status='active' and demo_expires_at <= v_now for update skip locked loop
    update public.demo_requests set demo_status='expired',expired_at=coalesce(expired_at,v_now),lifecycle_version=lifecycle_version+1,updated_at=v_now where id=v_request.id;
    update public.dealers set demo_status='expired',updated_at=v_now where id=v_request.linked_dealer_id and account_type='demo';
    insert into public.audit_logs(dealer_id,actor_type,action,entity_type,entity_id,before_json,after_json,metadata_json)
      values(v_request.linked_dealer_id,'system','demo.expired','demo_request',v_request.id,jsonb_build_object('demo_status','active'),jsonb_build_object('demo_status','expired'),jsonb_build_object('expired_at',v_now));
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('processed',v_count);
end $$;

revoke all on function public.transition_demo_lifecycle(uuid,uuid,text,text,integer,bigint) from public,anon,authenticated;
revoke all on function public.expire_due_demos() from public,anon,authenticated;
grant execute on function public.transition_demo_lifecycle(uuid,uuid,text,text,integer,bigint) to service_role;
grant execute on function public.expire_due_demos() to service_role;

commit;
