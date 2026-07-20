begin;

-- Security audit 2026-07-20: current_dealer_id() is the trust anchor behind almost every
-- RLS policy in this project (dealers, vehicles, vehicle_images, leads, customers,
-- appointments, notifications, all email_* tables). It has two competing definitions in
-- the migration tree: the membership-aware version in
-- 20260717000003_dealer_users_membership_foundation.sql (derives the dealer strictly from
-- an ACTIVE dealer_users row for auth.uid(), so suspending/removing a membership actually
-- revokes access), and an older, weaker one in the un-timestamped rls_vehicles_policies.sql
-- (reads profiles.dealer_id directly, with no membership/status check). Because that file
-- has no date prefix, it sorts lexically AFTER every 2026XXXX...-prefixed migration --
-- including this one's predecessors -- so on a database rebuilt by applying every
-- migration file once in filename order, the weaker definition silently wins, exactly the
-- same class of bug fixed for assert_demo_actor_membership in
-- 20260717000011_reapply_demo_actor_membership_admin_bypass.sql. Reasserting the correct,
-- final definition here, numbered after every file that could regress it, makes any future
-- replay of rls_vehicles_policies.sql alone harmless.
create or replace function public.current_dealer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with active_memberships as (
    select distinct du.dealer_id
    from public.dealer_users du
    where du.profile_id = auth.uid()
      and du.status = 'active'
      and du.dealer_id is not null
  )
  select case
    when (select count(*) from active_memberships) = 1 then (select dealer_id from active_memberships limit 1)
    else null::uuid
  end
$$;

revoke all on function public.current_dealer_id() from public;
grant execute on function public.current_dealer_id() to authenticated;

commit;
