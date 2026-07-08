-- Demo requests management for admin dashboard.

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text not null,
  city text not null,
  vehicle_count text not null,
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_demo_requests_status on public.demo_requests(status);
create index if not exists idx_demo_requests_created_at on public.demo_requests(created_at desc);

create or replace function public.set_demo_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_demo_requests_updated_at on public.demo_requests;
create trigger trg_demo_requests_updated_at
before update on public.demo_requests
for each row
execute function public.set_demo_requests_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'demo_requests_status_check'
  ) then
    alter table public.demo_requests
      add constraint demo_requests_status_check
      check (status in ('pending', 'contacted', 'activated', 'rejected'));
  end if;
end $$;
