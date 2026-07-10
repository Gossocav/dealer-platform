begin;

alter table public.dealers
  add column if not exists account_type text default 'paid',
  add column if not exists demo_status text default 'converted',
  add column if not exists demo_started_at timestamptz,
  add column if not exists demo_expires_at timestamptz,
  add column if not exists demo_request_id uuid,
  add column if not exists demo_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists demo_approved_at timestamptz,
  add column if not exists demo_converted_at timestamptz,
  add column if not exists demo_revoked_at timestamptz;

create index if not exists dealers_account_type_idx on public.dealers (account_type);
create index if not exists dealers_demo_status_idx on public.dealers (demo_status);
create index if not exists dealers_demo_expires_at_idx on public.dealers (demo_expires_at);
create index if not exists demo_requests_status_idx on public.demo_requests (status);
create index if not exists demo_requests_email_idx on public.demo_requests (email);

update public.dealers
set account_type = coalesce(nullif(trim(account_type), ''), 'paid'),
    demo_status = coalesce(nullif(trim(demo_status), ''), 'converted')
where id is not null;

alter table public.dealers
  alter column account_type set default 'paid',
  alter column demo_status set default 'converted';

commit;
