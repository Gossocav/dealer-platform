-- Read-only pre-deploy audit for the Demo engine. Run manually against the
-- intended database and review every non-zero result before applying migrations.

select demo_request_id, count(*) as dealer_count
from public.dealers
where demo_request_id is not null
group by demo_request_id
having count(*) > 1;

select code from (values ('base'), ('pro'), ('elite')) expected(code)
where not exists (select 1 from public.demo_profiles p where p.code = expected.code and p.enabled);

select id, demo_status from public.demo_requests
where demo_status is null or demo_status not in
  ('not_configured','configured','ready_for_activation','active','expired','suspended','revoked','converted');

select id, demo_status from public.demo_requests
where demo_status in ('configured','ready_for_activation','active','expired','suspended','revoked','converted')
  and (demo_profile_id is null or demo_profile_code is null or demo_duration_days is null
    or jsonb_typeof(demo_modules) <> 'object' or jsonb_typeof(demo_limits) <> 'object'
    or jsonb_typeof(demo_marketing_services) <> 'object');

select id, linked_dealer_id, demo_auth_user_id, activation_state
from public.demo_requests
where demo_status = 'active' and (
  activation_state <> 'completed' or linked_dealer_id is null or demo_auth_user_id is null
  or not exists (select 1 from public.dealers d where d.id = demo_requests.linked_dealer_id and d.demo_request_id = demo_requests.id)
  or not exists (select 1 from public.dealer_users du where du.dealer_id = demo_requests.linked_dealer_id and du.profile_id = demo_requests.demo_auth_user_id and du.status = 'active')
);

select id, linked_dealer_id, demo_expires_at from public.demo_requests
where demo_status = 'active' and demo_expires_at <= now();

select du.profile_id, count(distinct du.dealer_id) as active_dealers
from public.dealer_users du where du.status = 'active'
group by du.profile_id having count(distinct du.dealer_id) > 1;

select d.id, d.demo_status from public.dealers d
where d.account_type = 'demo' and (d.demo_request_id is null
  or not exists (select 1 from public.demo_requests r where r.id = d.demo_request_id and r.linked_dealer_id = d.id));

select r.id, r.linked_dealer_id from public.demo_requests r
where r.linked_dealer_id is not null
  and not exists (select 1 from public.dealers d where d.id = r.linked_dealer_id and d.demo_request_id = r.id);

select o.id, o.bucket_id, o.name
from storage.objects o
where o.bucket_id = 'vehicle-images'
  and not exists (
    select 1 from public.vehicles v
    where v.id::text in (split_part(o.name, '/', 1), split_part(o.name, '/', 2))
  );
