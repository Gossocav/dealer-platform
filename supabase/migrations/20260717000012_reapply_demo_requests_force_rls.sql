    begin;

    -- 20260714000004_demo_requests_rls.sql set both `enable row level security` and
    -- `force row level security` on demo_requests. Live verification on 2026-07-20 found
    -- rls_enabled = true (real app traffic via anon/authenticated is correctly protected)
    -- but rls_forced = false — drifted from the migration file at some point outside the
    -- tracked history (see production-schema-drift memory). FORCE only affects the table
    -- owner role, which the app never queries as, so this had no real-world security impact;
    -- reasserting it purely to bring the live schema back in line with git.
    alter table public.demo_requests force row level security;

    commit;
