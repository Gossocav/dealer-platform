begin;

-- convert_demo in the admin route was left on a raw, non-transactional pair of updates
-- (dealers + demo_requests) that never touched dealer_demo_subscriptions. Because the
-- terminal-state guard added in reject_demo_request_atomic (20260717000006) checks
-- dealer_demo_subscriptions.demo_status, a demo converted through the old raw-update path
-- stayed 'active' in dealer_demo_subscriptions forever, so a later revoke could still hit
-- an already-converted paying dealer. Mirror reject_demo_request_atomic's shape so convert
-- goes through transition_demo_lifecycle('convert_demo', ...) and keeps all three tables
-- (dealer_demo_subscriptions, dealers, demo_requests) in sync atomically.
create or replace function public.convert_demo_request_atomic(
  p_request_id uuid,
  p_dealer_id uuid,
  p_actor_id uuid,
  p_lifecycle_version bigint,
  p_plan_code text default null
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
begin
  perform public.assert_demo_service_role();
  perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);

  if p_request_id is null or p_dealer_id is null or p_actor_id is null or p_lifecycle_version is null then
    return jsonb_build_object('outcome', 'DEMO_INVALID_INPUT');
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
    'convert_demo',
    'Demo converted by admin',
    p_lifecycle_version,
    p_plan_code
  );
  v_transition_outcome := coalesce(v_transition ->> 'outcome', 'DEMO_UNKNOWN_ERROR');

  if v_transition_outcome <> 'DEMO_LIFECYCLE_UPDATED' then
    return jsonb_build_object('outcome', v_transition_outcome, 'transition', v_transition);
  end if;

  v_request_before := to_jsonb(v_request);
  v_dealer_before := to_jsonb(v_dealer);

  update public.dealers
  set
    demo_request_id = p_request_id,
    account_type = 'paid',
    demo_status = 'converted',
    demo_converted_at = v_now,
    updated_at = v_now
  where id = p_dealer_id
  returning * into v_dealer;

  update public.demo_requests
  set
    status = 'converted',
    demo_status = 'converted',
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
    'demo.converted',
    'demo_request',
    p_request_id,
    v_request_before,
    to_jsonb(v_request),
    jsonb_build_object('dealer_before', v_dealer_before, 'dealer_after', to_jsonb(v_dealer)),
    p_actor_id
  );

  return jsonb_build_object(
    'outcome', 'DEMO_CONVERTED',
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

revoke all on function public.convert_demo_request_atomic(uuid, uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.convert_demo_request_atomic(uuid, uuid, uuid, bigint, text) to service_role;

commit;
