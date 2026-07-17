begin;

-- Required by server-side Demo/Admin API routes that use service_role via PostgREST.
grant usage on schema public to service_role;

grant select, insert, update, delete on table public.demo_requests to service_role;
grant select on table public.demo_profiles to service_role;
grant select, insert, update on table public.dealers to service_role;
grant select, insert, update on table public.profiles to service_role;
grant select, insert, update on table public.dealer_users to service_role;
grant insert on table public.audit_logs to service_role;

commit;
