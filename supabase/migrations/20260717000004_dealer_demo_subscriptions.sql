begin;

create table if not exists public.dealer_demo_subscriptions (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  demo_request_id uuid not null,
  demo_profile_code text not null,
  modules_snapshot jsonb not null,
  limits_snapshot jsonb not null,
  marketing_snapshot jsonb not null,
  email_policy jsonb not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  extension_used boolean not null default false,
  extended_at timestamptz,
  extended_by uuid references auth.users(id) on delete set null,
  extension_reason text,
  request_status text not null default 'pending',
  activation_state text not null default 'idle',
  demo_status text not null default 'configured',
  lifecycle_version bigint not null default 1,
  converted_plan_code text,
  converted_at timestamptz,
  converted_by uuid references auth.users(id) on delete set null,
  subscription_status text not null default 'demo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_demo_subscriptions_dealer_fkey
    foreign key (dealer_id) references public.dealers(id) on delete cascade,
  constraint dealer_demo_subscriptions_request_fkey
    foreign key (demo_request_id) references public.demo_requests(id) on delete restrict,
  constraint dealer_demo_subscriptions_profile_code_check
    check (demo_profile_code in ('base', 'pro', 'elite')),
  constraint dealer_demo_subscriptions_request_status_check
    check (request_status in ('pending', 'contacted', 'qualified', 'approved_for_activation', 'rejected')),
  constraint dealer_demo_subscriptions_activation_state_check
    check (activation_state in ('idle', 'reserved', 'auth_ready', 'dealer_ready', 'profile_ready', 'membership_ready', 'completed', 'failed')),
  constraint dealer_demo_subscriptions_demo_status_check
    check (demo_status in ('configured', 'ready_for_activation', 'active', 'suspended', 'expired', 'revoked', 'converted')),
  constraint dealer_demo_subscriptions_subscription_status_check
    check (subscription_status in ('demo', 'pending_payment', 'paid', 'suspended', 'expired', 'revoked')),
  constraint dealer_demo_subscriptions_lifecycle_version_check
    check (lifecycle_version >= 1),
  constraint dealer_demo_subscriptions_snapshot_json_check
    check (
      jsonb_typeof(modules_snapshot) = 'object'
      and jsonb_typeof(limits_snapshot) = 'object'
      and jsonb_typeof(marketing_snapshot) = 'object'
      and jsonb_typeof(email_policy) = 'object'
    ),
  constraint dealer_demo_subscriptions_extension_guard_check
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
    ),
  constraint dealer_demo_subscriptions_conversion_guard_check
    check (
      (
        converted_plan_code is null
        and converted_at is null
        and converted_by is null
      )
      or
      (
        converted_plan_code in ('base', 'pro', 'elite')
        and converted_at is not null
        and converted_by is not null
      )
    )
);

create unique index if not exists dealer_demo_subscriptions_dealer_active_uidx
  on public.dealer_demo_subscriptions (dealer_id)
  where demo_status in ('configured', 'ready_for_activation', 'active', 'suspended', 'expired');

create unique index if not exists dealer_demo_subscriptions_request_uidx
  on public.dealer_demo_subscriptions (demo_request_id);

create index if not exists dealer_demo_subscriptions_status_idx
  on public.dealer_demo_subscriptions (request_status, activation_state, demo_status, subscription_status);

create index if not exists dealer_demo_subscriptions_expires_at_idx
  on public.dealer_demo_subscriptions (expires_at);

create or replace function public.set_dealer_demo_subscriptions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.protect_dealer_demo_subscription_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.demo_status in ('configured', 'ready_for_activation', 'active', 'suspended', 'expired', 'revoked', 'converted') and (
    new.dealer_id is distinct from old.dealer_id or
    new.demo_request_id is distinct from old.demo_request_id or
    new.demo_profile_code is distinct from old.demo_profile_code or
    new.modules_snapshot is distinct from old.modules_snapshot or
    new.limits_snapshot is distinct from old.limits_snapshot or
    new.marketing_snapshot is distinct from old.marketing_snapshot or
    new.email_policy is distinct from old.email_policy
  ) then
    raise exception 'Dealer demo subscription snapshot is immutable after configuration.' using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_dealer_demo_subscriptions_updated_at on public.dealer_demo_subscriptions;
create trigger trg_dealer_demo_subscriptions_updated_at
before update on public.dealer_demo_subscriptions
for each row
execute function public.set_dealer_demo_subscriptions_updated_at();

drop trigger if exists trg_protect_dealer_demo_subscription_snapshot on public.dealer_demo_subscriptions;
create trigger trg_protect_dealer_demo_subscription_snapshot
before update on public.dealer_demo_subscriptions
for each row
execute function public.protect_dealer_demo_subscription_snapshot();

commit;