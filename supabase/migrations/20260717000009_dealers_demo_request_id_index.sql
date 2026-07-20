begin;

-- dealers.demo_request_id (added in 20260710000001_demo_trial_account_support.sql) is queried
-- by the admin demo-requests list handler (.in("demo_request_id", requestIds)) and by the
-- reject/revoke/convert fallback lookups, but was never indexed — every lookup sequential-scans
-- dealers as the table grows.
create index if not exists dealers_demo_request_id_idx on public.dealers (demo_request_id);

commit;
