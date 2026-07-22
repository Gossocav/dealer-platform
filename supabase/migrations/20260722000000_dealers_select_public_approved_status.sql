-- The public marketplace RLS policy on public.dealers only allowed
-- status = 'active', but the application layer has always treated
-- ["approved", "active"] as the publishable set for dealers
-- (see MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES in src/lib/public-marketplace.ts,
-- and mapDealerRoute in src/app/api/account/resolve-route/route.ts, which routes a
-- dealer to /dashboard only once status = 'approved'). A dealer freshly approved
-- through the normal approval workflow could therefore log in but never appear
-- in the public marketplace, since the RLS policy silently excluded it.
-- Aligning the policy with the same status list already used everywhere else.

drop policy if exists dealers_select_public on public.dealers;
create policy dealers_select_public
on public.dealers
for select
to anon
using (coalesce(status, 'active') in ('active', 'approved'));

grant select on public.dealers to anon;
