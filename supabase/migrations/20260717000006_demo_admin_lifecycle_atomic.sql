begin;

-- demo_requests.status was frozen at 'activated' forever once approved: convert_demo never
-- updated it and revoke used the same value as a plain pre-activation rejection, so the admin
-- UI could not tell "converted to a paying dealer" or "revoked after being active" apart from
-- "still active" / "never approved". Widen the check constraint so both mutations below can
-- record their own terminal status.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'demo_requests_status_check'
  ) then
    alter table public.demo_requests drop constraint demo_requests_status_check;
  end if;

  alter table public.demo_requests
    add constraint demo_requests_status_check
    check (status in ('pending', 'contacted', 'activated', 'rejected', 'converted', 'revoked'));
end $$;

-- Platform admins drive demo lifecycle actions (activate/reject/revoke) on behalf of dealers
-- they are not, and should not be, a dealer_users member of. The original membership-only
-- check in 20260717000005_demo_rpc_core.sql made every admin-triggered RPC call fail with
-- DEMO_MEMBERSHIP_INVALID. Re-define it (create or replace preserves the existing grants) to
-- also accept an actor holding a platform admin profile role.
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

  if exists (
    select 1
    from public.profiles pr
    where pr.id = p_actor_id
      and lower(coalesce(pr.role, '')) in ('admin', 'platform_owner')
  ) then
    return;
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

create or replace function public.reject_demo_request_atomic(
  p_request_id uuid,
  p_dealer_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_lifecycle_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.demo_requests%rowtype;
  v_request_before jsonb;
  v_dealer public.dealers%rowtype;
  v_dealer_before jsonb;
  v_transition jsonb;
  v_transition_outcome text;
  v_now timestamptz := clock_timestamp();
  v_reason text := nullif(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), '');
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_request_id is null or p_dealer_id is null or p_actor_id is null or p_lifecycle_version is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
  end if;

  if v_reason is null or char_length(v_reason) not between 3 and 500 then
    return jsonb_build_object('outcome', 'DEMO_INVALID_REASON');
  end if;

  select *
  into v_request
  from public.demo_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'DEMO_NOT_FOUND');
  end if;

  select *
  into v_dealer
  from public.dealers
  where id = p_dealer_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'DEMO_DEALER_NOT_FOUND');
  end if;

  if (
    v_request.linked_dealer_id is not null and v_request.linked_dealer_id <> p_dealer_id
  ) or (
    v_dealer.demo_request_id is not null and v_dealer.demo_request_id <> p_request_id
  ) or (
    v_request.linked_dealer_id is null and v_dealer.demo_request_id is null
  ) then
    return jsonb_build_object('outcome', 'DEMO_REQUEST_DEALER_MISMATCH');
  end if;

  v_transition := public.transition_demo_lifecycle(
    p_dealer_id,
    p_actor_id,
    'revoke_demo',
    v_reason,
    p_lifecycle_version,
    null
  );
  v_transition_outcome := coalesce(v_transition ->> 'outcome', 'DEMO_UNKNOWN_ERROR');

  -- DEMO_TERMINAL_STATE must not be treated as success here: the subscription could already be
  -- 'converted' (a paying dealer), and force-overwriting dealers/demo_requests to revoked/rejected
  -- in that case would corrupt a converted account. Only a genuine transition is allowed through.
  if v_transition_outcome <> 'DEMO_LIFECYCLE_UPDATED' then
    return jsonb_build_object('outcome', v_transition_outcome, 'transition', v_transition);
  end if;

  v_request_before := to_jsonb(v_request);
  v_dealer_before := to_jsonb(v_dealer);

  update public.dealers
  set
    demo_request_id = p_request_id,
    demo_status = 'revoked',
    demo_revoked_at = v_now,
    updated_at = v_now
  where id = p_dealer_id
  returning * into v_dealer;

  update public.demo_requests
  set
    status = 'revoked',
    demo_status = 'revoked',
    linked_dealer_id = p_dealer_id,
    updated_at = v_now
  where id = p_request_id
  returning * into v_request;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_type, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_by
  )
  values (
    p_dealer_id,
    p_actor_id,
    'user',
    'demo.revoked',
    'demo_request',
    p_request_id,
    v_request_before,
    to_jsonb(v_request),
    jsonb_build_object('reason', v_reason, 'dealer_before', v_dealer_before, 'dealer_after', to_jsonb(v_dealer)),
    p_actor_id
  );

  return jsonb_build_object(
    'outcome', 'DEMO_REJECTED',
    'request', to_jsonb(v_request),
    'dealer', to_jsonb(v_dealer),
    'transition', v_transition,
    'before', jsonb_build_object(
      'request', v_request_before,
      'dealer', v_dealer_before
    )
  );
end;
$$;

revoke all on function public.reject_demo_request_atomic(uuid, uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.reject_demo_request_atomic(uuid, uuid, uuid, text, bigint) to service_role;

commit;
