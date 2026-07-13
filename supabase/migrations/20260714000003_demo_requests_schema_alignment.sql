begin;

do $$
begin
  if to_regclass('public.demo_requests') is null then
    raise exception using
      errcode = 'P0001',
      message = 'Missing required table public.demo_requests for demo_requests schema alignment.';
  end if;
end
$$;

alter table public.demo_requests
  add column if not exists dealership_name text;

alter table public.demo_requests
  add column if not exists company_name text;

-- Populate dealership_name from legacy company_name only when dealership_name is empty.
update public.demo_requests
set dealership_name = company_name
where coalesce(nullif(btrim(dealership_name), ''), '') = ''
  and company_name is not null
  and btrim(company_name) <> '';

-- Keep company_name for legacy compatibility and backfill only when missing.
update public.demo_requests
set company_name = dealership_name
where company_name is null
  and dealership_name is not null
  and btrim(dealership_name) <> '';

do $$
declare
  missing_count bigint;
begin
  select count(*)
  into missing_count
  from public.demo_requests
  where dealership_name is null
     or btrim(dealership_name) = '';

  if missing_count = 0 then
    alter table public.demo_requests
      alter column dealership_name set not null;
  else
    raise notice 'demo_requests.dealership_name remains nullable because % rows are empty after backfill.', missing_count;
  end if;
end
$$;

commit;
