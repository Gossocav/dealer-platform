-- Ritorno di 20260921120000_la_prova_dura_trenta_giorni.sql.
--
-- **NON eseguirlo insieme alla migration.** Questo file **annulla** il
-- passaggio della prova gratuita da sette a trenta giorni: rimette il vincolo
-- che pretende sette giorni esatti, riporta le due funzioni a scrivere
-- `interval '7 days'` e toglie `public.durata_della_prova()`. Va eseguito solo
-- se si vuole tornare indietro, e in quel caso va rimesso a sette anche
-- `GIORNI_DI_PROVA` in `src/lib/durata-della-prova.ts`, altrimenti il sito
-- annuncia trenta giorni su demo che ne durano sette.
--
-- **Una cosa da guardare prima di eseguirlo, ed e' l'unica che puo'
-- fermarlo.** Il vincolo che questo file rimette pretende
-- `expires_at = starts_at + interval '7 days'` **esatti**, e Postgres lo
-- verifica su tutte le righe gia' presenti. Se nel frattempo e' stata
-- attivata anche una sola demo da trenta giorni, il ritorno si ferma a meta'
-- con *"is violated by some row"*. Si contano prima:
--
--     select count(*) from public.dealer_demo_subscriptions
--     where expires_at <> starts_at + interval '7 days' and extension_used is false;
--
-- Se il conto non e' zero, quelle righe vanno decise una per una -- e sono
-- demo vere di concessionari veri, non un dettaglio tecnico.

begin;

-- 1. Il vincolo torna com'era: durata e coerenza della proroga nella stessa
--    espressione.
alter table public.dealer_demo_subscriptions
  drop constraint if exists dealer_demo_subscriptions_durata_ragionevole_check;

alter table public.dealer_demo_subscriptions
  drop constraint if exists dealer_demo_subscriptions_extension_guard_check;

alter table public.dealer_demo_subscriptions
  add constraint dealer_demo_subscriptions_extension_guard_check
  check (
    (
      extension_used is false
      and extended_at is null
      and extended_by is null
      and extension_reason is null
      and expires_at = starts_at + interval '7 days'
    )
    or
    (
      extension_used is true
      and extended_at is not null
      and extended_by is not null
      and char_length(btrim(extension_reason)) between 3 and 500
      and expires_at between starts_at + interval '7 days' and starts_at + interval '14 days'
    )
  );

-- 2. Le due funzioni tornano al testo di luglio, quello che era in produzione
--    fino al 21/09/2026.

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

-- 3. La casa della durata sparisce. Si toglie per ultima: prima nessuno la
--    chiama piu'.
drop function if exists public.durata_della_prova();

commit;
