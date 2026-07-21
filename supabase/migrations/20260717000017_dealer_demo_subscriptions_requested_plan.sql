begin;

-- The dealer can now request a plan from their own dashboard ("Scegli il tuo piano")
-- while still in demo. This is separate from converted_plan_code (set only once an
-- admin actually activates a plan via convert_demo) -- it just records what the dealer
-- asked for, so the admin panel can show/pre-select it before acting.
alter table public.dealer_demo_subscriptions
  add column if not exists requested_plan_code text,
  add column if not exists requested_plan_at timestamptz;

alter table public.dealer_demo_subscriptions
  drop constraint if exists dealer_demo_subscriptions_requested_plan_code_check;

alter table public.dealer_demo_subscriptions
  add constraint dealer_demo_subscriptions_requested_plan_code_check
  check (requested_plan_code is null or requested_plan_code in ('base', 'pro', 'elite'));

commit;
