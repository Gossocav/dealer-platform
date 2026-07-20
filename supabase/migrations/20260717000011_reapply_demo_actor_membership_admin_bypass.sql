begin;

-- Incident 2026-07-20: while catching up production on migrations missing since 2026-07-10,
-- 20260717000005_demo_rpc_core.sql was re-run (as part of that catch-up batch) *after*
-- 20260717000006_demo_admin_lifecycle_atomic.sql had already patched
-- assert_demo_actor_membership to let platform admins act on dealers they aren't a
-- dealer_users member of. Since both files define this function with `create or replace`,
-- re-running 000005 silently reverted 000006's fix -- the exact DEMO_MEMBERSHIP_INVALID bug
-- PR #9 was built to close came back, blocking activate_demo/reject/revoke_demo/convert_demo
-- for every platform admin again.
--
-- On a database built by running every migration file once, in order, this can't happen --
-- 000006 always runs after 000005. It only bites when an earlier file gets re-applied in
-- isolation during gap recovery (see [[production-schema-drift]]). Re-asserting the final,
-- correct definition here, numbered after every file that could regress it, makes any future
-- replay of 000005 alone harmless.
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

commit;
